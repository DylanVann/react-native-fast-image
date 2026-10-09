package com.dylanvann.fastimage;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// A small HTTP server for the downloads' tests, which holds a response where
// a test says, as the example's slow image server does: before its status
// line, or after part of its body (once the client has the headers, so OkHttp
// counts the call as done, and other calls to the host aren't held up). Each
// response closes its connection.
final class TestServer implements Closeable {
    static final class Route {
        int status = 200;
        // Different for each path, so a test can tell which url's bytes a
        // request got.
        byte[] body;
        boolean chunked = false;
        boolean holdHeaders = false;
        long holdAfter = -1;
        final CountDownLatch released = new CountDownLatch(1);
        // The client hung up before the whole response was sent: while it was
        // held, or as the server wrote it (a write fails once the client has
        // gone, e.g. a download cancelled just after the server read its
        // request).
        final CountDownLatch hungUp = new CountDownLatch(1);

        Route(String path) {
            body = bytes(16 * 1024, path.hashCode());
        }

        Route status(int status) {
            this.status = status;
            body = "Not found".getBytes(StandardCharsets.US_ASCII);
            return this;
        }

        Route body(byte[] body) {
            this.body = body;
            return this;
        }

        // Without a Content-Length.
        Route chunked() {
            chunked = true;
            return this;
        }

        // Nothing is sent until release().
        Route holdHeaders() {
            holdHeaders = true;
            return this;
        }

        // The headers and the body's first `bytes` are sent, then the rest
        // on release().
        Route holdAfter(long bytes) {
            holdAfter = bytes;
            return this;
        }

        void release() {
            released.countDown();
        }
    }

    private final ServerSocket socket;
    private final ExecutorService threads = Executors.newCachedThreadPool();
    private final Map<String, Route> routes = new ConcurrentHashMap<>();
    // Guarded by this. The paths requested, in the order they arrived.
    private final List<String> requests = new ArrayList<>();

    TestServer() throws IOException {
        socket = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        threads.execute(new Runnable() {
            @Override
            public void run() {
                accept();
            }
        });
    }

    static byte[] bytes(int count, long seed) {
        byte[] bytes = new byte[count];
        new Random(seed).nextBytes(bytes);
        return bytes;
    }

    String url(String path) {
        return "http://127.0.0.1:" + socket.getLocalPort() + path;
    }

    Route route(String path) {
        Route route = new Route(path);
        routes.put(path, route);
        return route;
    }

    synchronized List<String> requests() {
        return new ArrayList<>(requests);
    }

    synchronized int count(String path) {
        int count = 0;
        for (String requested : requests) {
            if (requested.equals(path)) count++;
        }
        return count;
    }

    // Waits for `path` to be requested.
    synchronized void awaitRequest(String path) throws InterruptedException {
        long end = System.currentTimeMillis() + 10_000;
        while (!requests.contains(path)) {
            long left = end - System.currentTimeMillis();
            if (left <= 0) throw new AssertionError(path + " wasn't requested; requests: " + requests);
            wait(left);
        }
    }

    // Waits for `count` requests in all.
    synchronized void awaitRequests(int count) throws InterruptedException {
        long end = System.currentTimeMillis() + 10_000;
        while (requests.size() < count) {
            long left = end - System.currentTimeMillis();
            if (left <= 0) throw new AssertionError(count + " requests expected; requests: " + requests);
            wait(left);
        }
    }

    @Override
    public void close() throws IOException {
        for (Route route : routes.values()) route.release();
        socket.close();
        threads.shutdownNow();
    }

    private void accept() {
        while (!socket.isClosed()) {
            final Socket client;
            try {
                client = socket.accept();
            } catch (IOException e) {
                return;
            }
            threads.execute(new Runnable() {
                @Override
                public void run() {
                    serve(client);
                }
            });
        }
    }

    private void serve(Socket client) {
        Route route = null;
        try (Socket connection = client) {
            InputStream in = connection.getInputStream();
            String requestLine = readLine(in);
            if (requestLine == null) return;
            String path = requestLine.split(" ")[1];
            String header;
            do {
                header = readLine(in);
            } while (header != null && !header.isEmpty());
            synchronized (this) {
                requests.add(path);
                notifyAll();
            }
            route = routes.get(path);
            if (route == null) route = new Route(path).status(404);
            if (route.holdHeaders && !hold(route, connection, in)) return;
            OutputStream out = connection.getOutputStream();
            String head = "HTTP/1.1 " + route.status + (route.status == 200 ? " OK" : " Not Found") + "\r\n"
                    + "Content-Type: image/jpeg\r\n"
                    + "Connection: close\r\n"
                    + (route.chunked ? "Transfer-Encoding: chunked\r\n" : "Content-Length: " + route.body.length + "\r\n")
                    + "\r\n";
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            int split = route.holdAfter < 0 ? route.body.length : (int) Math.min(route.holdAfter, route.body.length);
            write(out, route, 0, split);
            out.flush();
            if (split < route.body.length) {
                if (!hold(route, connection, in)) return;
                write(out, route, split, route.body.length);
            }
            if (route.chunked) out.write("0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            out.flush();
        } catch (IOException e) {
            // The client went away, or the server closed.
            if (route != null) route.hungUp.countDown();
        }
    }

    // Waits for the route's release, or for the client to hang up (false).
    private static boolean hold(Route route, Socket connection, InputStream in) throws IOException {
        connection.setSoTimeout(20);
        while (route.released.getCount() > 0) {
            try {
                if (in.read() == -1) {
                    route.hungUp.countDown();
                    return false;
                }
            } catch (SocketTimeoutException e) {
                // Still there.
            } catch (IOException e) {
                route.hungUp.countDown();
                return false;
            }
        }
        connection.setSoTimeout(0);
        return true;
    }

    private static void write(OutputStream out, Route route, int from, int to) throws IOException {
        if (from == to) return;
        if (route.chunked) {
            out.write((Integer.toHexString(to - from) + "\r\n").getBytes(StandardCharsets.US_ASCII));
            out.write(route.body, from, to - from);
            out.write("\r\n".getBytes(StandardCharsets.US_ASCII));
        } else {
            out.write(route.body, from, to - from);
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') line.write(c);
        }
        if (c == -1 && line.size() == 0) return null;
        return line.toString("US-ASCII");
    }
}
