import React, { Component } from 'react'
import PropTypes from 'prop-types'
import {
    View,
    Image,
    NativeModules,
    requireNativeComponent,
    ViewPropTypes,
    StyleSheet,
} from 'react-native'

const FastImageViewNativeModule = NativeModules.FastImageView

class FastImage extends Component {
    componentDidMount() {
        this.runTimer()
    }

    componentDidUpdate(prevProps) {
        if (this.props.source.uri !== prevProps.source.uri) {
            this.setState({
                loaded: false,
                error: null,
                expired: false,
            })

            this.runTimer()
        }
    }

    componentWillUnmount() {
        clearTimeout(this.timeout)
    }

    runTimer() {
        this.timeout = setTimeout(() => {
            this.setState({ expired: true })
        }, 1000)
    }

    state = {
        loaded: false,
        error: null,
        expired: false,
    }

    setNativeProps(nativeProps) {
        this._root.setNativeProps(nativeProps)
    }

    captureRef = e => (this._root = e)

    render() {
        const {
            source,
            onLoadStart,
            onProgress,
            onLoad,
            onError,
            onLoadEnd,
            style,
            children,
            fallback,
            placeholder,
            ...props
        } = this.props

        const { expired, loaded, error } = this.state
        const resolvedSource = Image.resolveAssetSource(source)

        if (fallback) {
            return (
                <View
                    style={[styles.imageContainer, style]}
                    ref={this.captureRef}
                >
                    {expired && (!loaded || error) && placeholder}
                    <FastImageView
                        {...props}
                        style={StyleSheet.absoluteFill}
                        source={resolvedSource}
                        onLoadStart={onLoadStart}
                        onProgress={onProgress}
                        onLoad={onLoad}
                        onError={onError}
                        onLoadEnd={onLoadEnd}
                    />
                    {children}
                </View>
            )
        }

        return (
            <View style={[styles.imageContainer, style]} ref={this.captureRef}>
                {expired && (!loaded || error) && placeholder}
                <FastImageView
                    {...props}
                    style={StyleSheet.absoluteFill}
                    source={resolvedSource}
                    onFastImageLoadStart={onLoadStart}
                    onFastImageProgress={onProgress}
                    onFastImageLoad={onLoad}
                    onFastImageError={data => {
                        this.setState({
                            error: true,
                        })

                        onError(data)
                    }}
                    onFastImageLoadEnd={data => {
                        this.setState({
                            loaded: true,
                        })

                        onLoadEnd(data)
                    }}
                />
                {children}
            </View>
        )
    }
}

const styles = StyleSheet.create({
    imageContainer: {
        overflow: 'hidden',
    },
})

FastImage.resizeMode = {
    contain: 'contain',
    cover: 'cover',
    stretch: 'stretch',
    center: 'center',
}

FastImage.priority = {
    // lower than usual.
    low: 'low',
    // normal, the default.
    normal: 'normal',
    // higher than usual.
    high: 'high',
}

FastImage.cacheControl = {
    // Ignore headers, use uri as cache key, fetch only if not in cache.
    immutable: 'immutable',
    // Respect http headers, no aggressive caching.
    web: 'web',
    // Only load from cache.
    cacheOnly: 'cacheOnly',
}

FastImage.preload = sources => {
    FastImageViewNativeModule.preload(sources)
}

FastImage.defaultProps = {
    resizeMode: FastImage.resizeMode.cover,
    onLoadStart: () => {},
    onProgress: () => {},
    onLoad: () => {},
    onError: () => {},
    onLoadEnd: () => {},
}

const FastImageSourcePropType = PropTypes.shape({
    uri: PropTypes.string,
    headers: PropTypes.objectOf(PropTypes.string),
    priority: PropTypes.oneOf(Object.keys(FastImage.priority)),
    cache: PropTypes.oneOf(Object.keys(FastImage.cacheControl)),
})

FastImage.propTypes = {
    ...ViewPropTypes,
    source: PropTypes.oneOfType([FastImageSourcePropType, PropTypes.number]),
    onLoadStart: PropTypes.func,
    onProgress: PropTypes.func,
    onLoad: PropTypes.func,
    onError: PropTypes.func,
    onLoadEnd: PropTypes.func,
    fallback: PropTypes.bool,
    placeholder: PropTypes.node,
}

const FastImageView = requireNativeComponent('FastImageView', FastImage, {
    nativeOnly: {
        onFastImageLoadStart: true,
        onFastImageProgress: true,
        onFastImageLoad: true,
        onFastImageError: true,
        onFastImageLoadEnd: true,
    },
})

export default FastImage
