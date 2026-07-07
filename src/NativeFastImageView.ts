import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { Source } from './index'

export interface Spec extends TurboModule {
    preload: (sources: Source[]) => void
    clearMemoryCache: () => Promise<void>
    clearDiskCache: () => Promise<void>
}

export default TurboModuleRegistry.get<Spec>('FastImageView')
