import React, { Component } from 'react'
import PropTypes from 'prop-types'
import {
  Image,
  NativeModules,
  requireNativeComponent,
} from 'react-native'
import ViewPropTypes from './utils/ViewPropTypes'

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
      ...props
    } = this.props

    const resolvedSource = resolveAssetSource(source)
    return (
      <FastImageView
        ref={e => (this._root = e)}
        {...props}
        source={resolvedSource}
        onFastImageLoadStart={onLoadStart}
        onFastImageProgress={onProgress}
        onFastImageLoad={onLoad}
        onFastImageError={onError}
        onFastImageLoadEnd={onLoadEnd}
      />
    )
  }
}

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
    onFastImageLoadEnd: true
  },
})

export default FastImage
