package com.dylanvann.rnfibenchmark.macrobenchmark

import android.content.res.AssetManager
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.locks.LockSupport
import kotlin.concurrent.thread
import kotlin.math.max

// Serves the benchmark's images (../../images/out, in this APK's assets) on
// the phone, at http://127.0.0.1:<port>, as the iOS tests do
// (../../ios/UITests/ImageServer.swift): GET /<set>/<index>.jpg?run=<id> and
// /manifest.json, the query ignored for the lookup, and /requests?run=<id>,
// how many image requests it got for that run id (the probe's aren't
// counted): how many downloads a library made, e.g. one per photo shown at
// two sizes when it shares them. The app loads them over
// HTTP with each library's own networking, but every run gets the same
// network: `latencyMs` before each response (and before a new connection's
// first, for its handshake), and `mbps` shared by every response at once, as
// on one real link (0 for no limit). The manifest's and the network probe's
// (`?…&close`) responses close their connection, so no library starts with
// one open. The files are read when it starts, so every run is served from
// memory. The server runs in the test's process, not the app's.
class ImageServer(
    private val assets: AssetManager,
    private val latencyMs: Long,
    mbps: Double,
) : Closeable {
    private val socket = ServerSocket(0, 128, InetAddress.getByName("127.0.0.1"))
    private val link = Link(mbps)
    private val files = ConcurrentHashMap<String, ByteArray>()
    // Image requests by run id.
    private val requests = ConcurrentHashMap<String, AtomicInteger>()
    private val executor = Executors.newCachedThreadPool()

    val url: String get() = "http://127.0.0.1:${socket.localPort}"

    init {
        load("images")
        thread(name = "ImageServer") {
            while (!socket.isClosed) {
                val client = try {
                    socket.accept()
                } catch (e: IOException) {
                    break
                }
                try {
                    executor.execute { serve(client) }
                } catch (e: RejectedExecutionException) {
                    client.close()
                }
            }
        }
    }

    override fun close() {
        socket.close()
        executor.shutdownNow()
    }

    // A client can close its connection at any time, e.g. a list cancelling
    // a cell's download while it scrolls: that ends this connection, and
    // must not throw (an exception on any thread ends the test run), nor
    // must closing the server.
    private fun serve(client: Socket) {
        try {
            respond(client)
        } catch (e: IOException) {
            // The client went away.
        } catch (e: InterruptedException) {
            // The server was closed.
        } finally {
            try {
                client.close()
            } catch (e: IOException) {
            }
        }
    }

    private fun respond(client: Socket) {
        client.tcpNoDelay = true
        val input = BufferedInputStream(client.getInputStream())
        val output = BufferedOutputStream(client.getOutputStream(), CHUNK)
        sleep(latencyMs)
        // HTTP/1.1 with keep-alive: requests one after another.
        while (true) {
            val request = readLine(input) ?: return
            while (true) {
                val header = readLine(input) ?: return
                if (header.isEmpty()) break
            }
            val target = request.split(' ').getOrNull(1) ?: return
            val path = target.substringBefore('?').trimStart('/')
            val query = target.substringAfter('?', "").split('&')
            val closing = path == "manifest.json" || query.contains("close")
            val run = query.firstOrNull { it.startsWith("run=") }
                ?.let { URLDecoder.decode(it.removePrefix("run="), "UTF-8") }
            if (run != null && !closing && path.endsWith(".jpg")) {
                requests.getOrPut(run) { AtomicInteger() }.incrementAndGet()
            }
            sleep(latencyMs)
            if (path == "requests") {
                val count = (run?.let { requests[it]?.get() } ?: 0).toString().toByteArray()
                output.write(
                    ("HTTP/1.1 200 OK\r\n" +
                        "Content-Type: text/plain\r\n" +
                        "Content-Length: ${count.size}\r\n" +
                        "\r\n").toByteArray(),
                )
                output.write(count)
                output.flush()
                continue
            }
            val body = files[path]
            if (body == null) {
                output.write(
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray(),
                )
                output.flush()
                continue
            }
            val type = if (path.endsWith(".json")) "application/json" else "image/jpeg"
            output.write(
                ("HTTP/1.1 200 OK\r\n" +
                    "Content-Type: $type\r\n" +
                    "Content-Length: ${body.size}\r\n" +
                    "Cache-Control: public, max-age=31536000, immutable\r\n" +
                    (if (closing) "Connection: close\r\n" else "") +
                    "\r\n").toByteArray(),
            )
            var offset = 0
            while (offset < body.size) {
                val count = minOf(CHUNK, body.size - offset)
                link.send(count)
                output.write(body, offset, count)
                output.flush()
                offset += count
            }
            if (closing) return
        }
    }

    // Reads every file under `dir` in the assets, keyed by its path under
    // images/.
    private fun load(dir: String) {
        for (name in assets.list(dir).orEmpty()) {
            val path = "$dir/$name"
            if (assets.list(path).isNullOrEmpty()) {
                files[path.removePrefix("images/")] = assets.open(path).use { it.readBytes() }
            } else {
                load(path)
            }
        }
    }

    // One line of a request, without its CRLF; null at the end of the stream.
    private fun readLine(input: InputStream): String? {
        val line = StringBuilder()
        while (true) {
            val byte = input.read()
            if (byte == -1) return null
            if (byte == '\n'.code) return line.toString().trimEnd('\r')
            line.append(byte.toChar())
        }
    }

    // A link's bandwidth, shared by every response: each chunk takes its
    // turn, for as long as its bytes take at `mbps`.
    private class Link(mbps: Double) {
        private val nanosPerByte = if (mbps > 0) 8_000.0 / mbps else 0.0
        private var free = 0L

        fun send(bytes: Int) {
            if (nanosPerByte == 0.0) return
            val done: Long
            synchronized(this) {
                val start = max(System.nanoTime(), free)
                done = start + (bytes * nanosPerByte).toLong()
                free = done
            }
            while (true) {
                val wait = done - System.nanoTime()
                if (wait <= 0) return
                LockSupport.parkNanos(wait)
            }
        }
    }

    private fun sleep(ms: Long) {
        if (ms > 0) Thread.sleep(ms)
    }

    private companion object {
        const val CHUNK = 16 * 1024
    }
}
