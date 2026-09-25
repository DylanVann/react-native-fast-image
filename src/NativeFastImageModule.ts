// The native module (preload and the caches), for React Native's Codegen.
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

export interface Spec extends TurboModule {
    // Sources as the view's `source` prop takes them (headers as a list).
    // Resolves with a result for each, in order.
    preload(sources: ReadonlyArray<UnsafeObject>): Promise<Array<UnsafeObject>>
    clearMemoryCache(): Promise<void>
    clearDiskCache(): Promise<void>
}

export default TurboModuleRegistry.getEnforcing<Spec>('FastImageModule')
