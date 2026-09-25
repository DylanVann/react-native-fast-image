// The Codegen specs import their types the long way, which every React Native
// version's Codegen understands. React Native 0.80+ types only export them from
// 'react-native' (CodegenTypes), so point the long path there for type
// checking.
declare module 'react-native/Libraries/Types/CodegenTypes' {
    import type { CodegenTypes } from 'react-native'
    export type DirectEventHandler<T> = CodegenTypes.DirectEventHandler<T>
    export type Double = CodegenTypes.Double
    export type Int32 = CodegenTypes.Int32
    export type UnsafeObject = CodegenTypes.UnsafeObject
    export type WithDefault<T, V> = CodegenTypes.WithDefault<
        T,
        V extends T ? V : never
    >
}
