import React, { forwardRef, memo } from 'react';
import { NativeModules, Image, View, StyleSheet, requireNativeComponent } from 'react-native';

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;

  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }

  return target;
}

var FastImageViewNativeModule = NativeModules.FastImageView;
var resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center'
};
var priority = {
  low: 'low',
  normal: 'normal',
  high: 'high'
};
var cacheControl = {
  // Ignore headers, use uri as cache key, fetch only if not in cache.
  immutable: 'immutable',
  // Respect http headers, no aggressive caching.
  web: 'web',
  // Only load from cache.
  cacheOnly: 'cacheOnly'
};

function FastImageBase(_ref) {
  var source = _ref.source,
      tintColor = _ref.tintColor,
      onLoadStart = _ref.onLoadStart,
      onProgress = _ref.onProgress,
      onLoad = _ref.onLoad,
      onError = _ref.onError,
      onLoadEnd = _ref.onLoadEnd,
      style = _ref.style,
      fallback = _ref.fallback,
      children = _ref.children,
      _ref$resizeMode = _ref.resizeMode,
      resizeMode = _ref$resizeMode === void 0 ? 'cover' : _ref$resizeMode,
      forwardedRef = _ref.forwardedRef,
      props = _objectWithoutPropertiesLoose(_ref, ["source", "tintColor", "onLoadStart", "onProgress", "onLoad", "onError", "onLoadEnd", "style", "fallback", "children", "resizeMode", "forwardedRef"]);

  var resolvedSource = Image.resolveAssetSource(source);

  if (fallback) {
    return React.createElement(View, {
      style: [styles.imageContainer, style],
      ref: forwardedRef
    }, React.createElement(Image, Object.assign({}, props, {
      style: StyleSheet.absoluteFill,
      source: resolvedSource,
      onLoadStart: onLoadStart,
      onProgress: onProgress,
      onLoad: onLoad,
      onError: onError,
      onLoadEnd: onLoadEnd,
      resizeMode: resizeMode
    })), children);
  }

  return React.createElement(View, {
    style: [styles.imageContainer, style],
    ref: forwardedRef
  }, React.createElement(FastImageView, Object.assign({}, props, {
    tintColor: tintColor,
    style: StyleSheet.absoluteFill,
    source: resolvedSource,
    onFastImageLoadStart: onLoadStart,
    onFastImageProgress: onProgress,
    onFastImageLoad: onLoad,
    onFastImageError: onError,
    onFastImageLoadEnd: onLoadEnd,
    resizeMode: resizeMode
  })), children);
}

var FastImageMemo = /*#__PURE__*/memo(FastImageBase);
var FastImageComponent = /*#__PURE__*/forwardRef(function (props, ref) {
  return React.createElement(FastImageMemo, Object.assign({
    forwardedRef: ref
  }, props));
});
FastImageComponent.displayName = 'FastImage';
var FastImage = FastImageComponent;
FastImage.resizeMode = resizeMode;
FastImage.cacheControl = cacheControl;
FastImage.priority = priority;

FastImage.preload = function (sources) {
  return FastImageViewNativeModule.preload(sources);
};

var styles = /*#__PURE__*/StyleSheet.create({
  imageContainer: {
    overflow: 'hidden'
  }
}); // Types of requireNativeComponent are not correct.

var FastImageView = /*#__PURE__*/requireNativeComponent('FastImageView', FastImage, {
  nativeOnly: {
    onFastImageLoadStart: true,
    onFastImageProgress: true,
    onFastImageLoad: true,
    onFastImageError: true,
    onFastImageLoadEnd: true
  }
});

export default FastImage;
//# sourceMappingURL=react-native-fast-image.esm.js.map
