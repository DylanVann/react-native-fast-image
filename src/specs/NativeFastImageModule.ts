// FastImage's functions (preload, the caches), as a TurboModule from React
// Native's Codegen. FastImage (index.tsx) checks their arguments and shapes
// their results.
import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
    // A result per source, in order: { ok, width, height } or { ok, error }.
    preload(
        sources: Array<CodegenTypes.UnsafeObject>,
    ): Promise<Array<CodegenTypes.UnsafeObject>>
    // { ok, path } or { ok, error }.
    getCachePath(
        source: CodegenTypes.UnsafeObject,
    ): Promise<CodegenTypes.UnsafeObject>
    // { ok, path } or { ok, error }.
    writeToCache(
        source: CodegenTypes.UnsafeObject,
        file: string,
    ): Promise<CodegenTypes.UnsafeObject>
    // { maxDiskSize: number, ..., reset: [names] }: the limits to set, and the
    // names of those to reset (null isn't sent: iOS would drop it). Resolves
    // with the limits in effect.
    configureCache(
        limits: CodegenTypes.UnsafeObject,
    ): Promise<CodegenTypes.UnsafeObject>
    // { ok } or { ok, error }.
    clearMemoryCache(): Promise<CodegenTypes.UnsafeObject>
    clearDiskCache(): Promise<CodegenTypes.UnsafeObject>
}

// null where the app doesn't have the native module (Jest, Expo Go, an app
// not rebuilt after installing): FastImage's functions throw when they're
// called, rather than importing FastImage throwing.
export default TurboModuleRegistry.get<Spec>('FastImageModule')
