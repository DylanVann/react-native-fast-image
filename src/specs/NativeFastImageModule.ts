// FastImage's functions (preload, the caches), as a TurboModule from React
// Native's Codegen. FastImage (index.tsx) checks their arguments and shapes
// their results.
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

export interface Spec extends TurboModule {
    // A result per source, in order: { ok, width, height } or { ok, error }.
    preload(sources: Array<UnsafeObject>): Promise<Array<UnsafeObject>>
    // { ok, path } or { ok, error }.
    getCachePath(source: UnsafeObject): Promise<UnsafeObject>
    // { ok, path } or { ok, error }.
    writeToCache(source: UnsafeObject, file: string): Promise<UnsafeObject>
    // The limits in effect.
    configureCache(limits: UnsafeObject): Promise<UnsafeObject>
    clearMemoryCache(): Promise<void>
    clearDiskCache(): Promise<void>
}

export default TurboModuleRegistry.getEnforcing<Spec>('FastImageModule')
