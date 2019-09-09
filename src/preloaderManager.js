import { NativeEventEmitter, NativeModules } from 'react-native'
const nativeManager = NativeModules.FastImagePreloaderManager
const nativeEmitter = new NativeEventEmitter(nativeManager)

class PreloaderManager {
    _instances = new Map()
    _subProgress = null
    _subComplete = null

    preloadManager = (sources, onProgress, onComplete) => {
        nativeManager.createPreloader().then(id => {
            if (this._instances.size === 0) {
                this._subProgress = nativeEmitter.addListener(
                    'fffastimage-progress',
                    this.onProgress,
                )
                this._subComplete = nativeEmitter.addListener(
                    'fffastimage-complete',
                    this.onComplete,
                )
            }
            this._instances.set(id, { onProgress, onComplete })
            nativeManager.preloadManager(id, sources)
        })
    }

    onProgress = ({ id, finished, total , url, cachePath }) => {
        const { onProgress } = this._instances.get(id)
        if (onProgress) {
            onProgress(finished, total, url, cachePath)
        }
    }

    onComplete = ({ id, finished, skipped }) => {
        const { onComplete } = this._instances.get(id)
        if (onComplete) {
            onComplete(finished, skipped)
        }
        this._instances.delete(id)
        if (this._instances.size === 0) {
            this._subProgress.remove()
            this._subComplete.remove()
        }
    }
}

const preloaderManager = new PreloaderManager()
export default preloaderManager
