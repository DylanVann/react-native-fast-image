import { NativeEventEmitter, NativeModules } from 'react-native'
const nativeManager = NativeModules.FastImagePreloaderManager
const nativeEmitter = new NativeEventEmitter(nativeManager)

class PreloaderManager {
    _instances = new Map()
    _subProgress = null
    _subComplete = null

    preload = (sources, onProgress, onComplete) => {
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
            this._instances.set(id, { onProgress, onComplete, urls: [] })
            nativeManager.preload(id, sources)
        })
    }

    onProgress = ({ id, finished, total, url }) => {
        const instance = this._instances.get(id)
        // null is returned when url failed to load
        if (url) {
            instance.urls = [...instance.urls, url]
        }
        if (instance.onProgress) {
            instance.onProgress(instance.urls, finished, total)
        }
    }

    onComplete = ({ id, finished, skipped }) => {
        const { onComplete, urls } = this._instances.get(id)
        if (onComplete) {
            onComplete(urls, finished, skipped)
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
