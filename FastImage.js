import React, { PropTypes, Component } from 'react'
import { requireNativeComponent, Image, View } from 'react-native'

const resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource')

class FastImage extends Component {
  setNativeProps(nativeProps) {
    this._root.setNativeProps(nativeProps)
  }

  render() {
    const { source, onError, onLoad, ...props } = this.props

    // If there's no source or source uri just fallback to Image.
    if (!source || !source.uri) {
      return (
        <Image
          ref={e => (this._root = e)}
          {...props}
          source={source}
          onError={onError}
          onLoad={onLoad}
        />
      )
    }

    const resolvedSource = resolveAssetSource(source)
    return (
      <FastImageView
        ref={e => (this._root = e)}
        {...props}
        source={resolvedSource}
        onFastImageError={onError}
        onFastImageLoad={onLoad}
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

const FastImageSourcePropType = PropTypes.shape({
  uri: PropTypes.string,
  headers: PropTypes.objectOf(PropTypes.string),
  priority: PropTypes.oneOf(Object.keys(FastImage.priority)),
})

FastImage.propTypes = {
  ...View.propTypes,
  source: FastImageSourcePropType,
  onFastImageError: PropTypes.func,
  onFastImageLoad: PropTypes.func,
}

FastImage.defaultProps = {
  resizeMode: FastImage.resizeMode.cover,
  onLoad: Function.prototype,
  onError: Function.prototype,
}

const FastImageView = requireNativeComponent('FastImageView', FastImage, {
  nativeOnly: { onFastImageError: true, onFastImageLoad: true },
})

export default FastImage
