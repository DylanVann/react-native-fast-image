// The shared example code (../ReactNativeFastImageExample/src) clears timers
// that may not be set, as React Native 0.87's types allow; 0.83's take only a
// number. Both accept it at runtime.
declare function clearTimeout(handle: number | null | undefined): void
