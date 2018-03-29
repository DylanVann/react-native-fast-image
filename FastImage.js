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

const resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource')

const FastImageViewNativeModule = NativeModules.FastImageView

class FastImage extends Component {
  setNativeProps(nativeProps) {
    this._root.setNativeProps(nativeProps)
  }

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
      borderRadius,
      ...props
    } = this.props

    // If there's no source or source uri just fallback to Image.
    if (!source || !source.uri) {
      return (
        <Image
          ref={e => (this._root = e)}
          {...props}
          style={style}
          source={source}
          onLoadStart={onLoadStart}
          onProgress={onProgress}
          onLoad={onLoad}
          onError={onError}
          onLoadEnd={onLoadEnd}
        />
      )
    }

    const resolvedSource = resolveAssetSource(source)

    if (children) {
      throw new Error(
        'The <FastImage> component cannot contain children. If you want to render content on top of the image consider using absolute positioning.',
      )
    }

    if (!borderRadius) {
      return (
        <FastImageView
          ref={e => (this._root = e)}
          {...props}
          style={style}
          source={resolvedSource}
          onFastImageLoadStart={onLoadStart}
          onFastImageProgress={onProgress}
          onFastImageLoad={onLoad}
          onFastImageError={onError}
          onFastImageLoadEnd={onLoadEnd}
        />
      )
    }

    return (
      <View style={[style, styles.imageContainer]} borderRadius={borderRadius}>
        <FastImageView
          ref={e => (this._root = e)}
          {...props}
          style={StyleSheet.absoluteFill}
          source={resolvedSource}
          onFastImageLoadStart={onLoadStart}
          onFastImageProgress={onProgress}
          onFastImageLoad={onLoad}
          onFastImageError={onError}
          onFastImageLoadEnd={onLoadEnd}
        />
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
  low: 'low',
  normal: 'normal',
  high: 'high',
}

FastImage.preload = sources => {
  FastImageViewNativeModule.preload(sources)
}

FastImage.defaultProps = {
  resizeMode: FastImage.resizeMode.cover,
}

const FastImageSourcePropType = PropTypes.shape({
  uri: PropTypes.string,
  headers: PropTypes.objectOf(PropTypes.string),
  priority: PropTypes.oneOf(Object.keys(FastImage.priority)),
})

FastImage.propTypes = {
  ...ViewPropTypes,
  source: PropTypes.oneOfType([FastImageSourcePropType, PropTypes.number]),
  onLoadStart: PropTypes.func,
  onProgress: PropTypes.func,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  onLoadEnd: PropTypes.func,
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
