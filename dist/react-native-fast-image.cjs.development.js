'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var React = require('react');
var React__default = _interopDefault(React);
var reactNative = require('react-native');

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

var FastImageViewNativeModule = reactNative.NativeModules.FastImageView;
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

  var resolvedSource = reactNative.Image.resolveAssetSource(source);

  if (fallback) {
    return React__default.createElement(reactNative.View, {
      style: [styles.imageContainer, style],
      ref: forwardedRef
    }, React__default.createElement(reactNative.Image, Object.assign({}, props, {
      style: reactNative.StyleSheet.absoluteFill,
      source: resolvedSource,
      onLoadStart: onLoadStart,
      onProgress: onProgress,
      onLoad: onLoad,
      onError: onError,
      onLoadEnd: onLoadEnd,
      resizeMode: resizeMode
    })), children);
  }

  return React__default.createElement(reactNative.View, {
    style: [styles.imageContainer, style],
    ref: forwardedRef
  }, React__default.createElement(FastImageView, Object.assign({}, props, {
    tintColor: tintColor,
    style: reactNative.StyleSheet.absoluteFill,
    source: resolvedSource,
    onFastImageLoadStart: onLoadStart,
    onFastImageProgress: onProgress,
    onFastImageLoad: onLoad,
    onFastImageError: onError,
    onFastImageLoadEnd: onLoadEnd,
    resizeMode: resizeMode
  })), children);
}

var FastImageMemo = /*#__PURE__*/React.memo(FastImageBase);
var FastImageComponent = /*#__PURE__*/React.forwardRef(function (props, ref) {
  return React__default.createElement(FastImageMemo, Object.assign({
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

var styles = /*#__PURE__*/reactNative.StyleSheet.create({
  imageContainer: {
    overflow: 'hidden'
  }
}); // Types of requireNativeComponent are not correct.

var FastImageView = /*#__PURE__*/reactNative.requireNativeComponent('FastImageView', FastImage, {
  nativeOnly: {
    onFastImageLoadStart: true,
    onFastImageProgress: true,
    onFastImageLoad: true,
    onFastImageError: true,
    onFastImageLoadEnd: true
  }
});

exports.default = FastImage;
//# sourceMappingURL=react-native-fast-image.cjs.development.js.map
