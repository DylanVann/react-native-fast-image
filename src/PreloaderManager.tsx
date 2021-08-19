import { NativeEventEmitter, NativeModules } from 'react-native'

import type { EmitterSubscription } from 'react-native'

import type {
    Source,
    PreloadProgressHandler,
    PreloadCompletionHandler,
} from './index'

const nativeManager = NativeModules.FastImagePreloaderManager
const nativeEmitter = new NativeEventEmitter(nativeManager)

type PreloadCallbacks = {
    onProgress?: PreloadProgressHandler
    onComplete?: PreloadCompletionHandler
}

type OnProgressParams = {
    id: number
    finished: number
    total: number
}

type OnCompleteParams = {
    id: number
    finished: number
    skipped: number
}

class PreloaderManager {
    _instances: Map<number, PreloadCallbacks> = new Map()
    _subProgress!: EmitterSubscription
    _subComplete!: EmitterSubscription

    preload(
        sources: Source[],
        onProgress?: PreloadProgressHandler,
        onComplete?: PreloadCompletionHandler,
    ) {
        nativeManager.createPreloader().then((id: number) => {
            if (this._instances.size === 0) {
                this._subProgress = nativeEmitter.addListener(
                    'fffastimage-progress',
                    this.onProgress.bind(this),
                )
                this._subComplete = nativeEmitter.addListener(
                    'fffastimage-complete',
                    this.onComplete.bind(this),
                )
            }

            this._instances.set(id, { onProgress, onComplete })

            nativeManager.preload(id, sources)
        })
    }

    onProgress({ id, finished, total }: OnProgressParams) {
        const instance = this._instances.get(id)

        if (instance && instance.onProgress)
            instance.onProgress(finished, total)
    }

    onComplete({ id, finished, skipped }: OnCompleteParams) {
        const instance = this._instances.get(id)

        if (instance && instance.onComplete)
            instance.onComplete(finished, skipped)

        this._instances.delete(id)

        if (
            this._instances.size === 0 &&
            this._subProgress &&
            this._subComplete
        ) {
            this._subProgress.remove()
            this._subComplete.remove()
        }
    }
}

const preloaderManager = new PreloaderManager()

export default preloaderManager