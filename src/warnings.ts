// FastImage's development warnings, each once per app (a list would repeat it
// for every image).

const warned = new Set<string>()

export function warnOnce(key: string, message: string) {
    if (!warned.has(key)) {
        warned.add(key)
        console.warn(message)
    }
}
