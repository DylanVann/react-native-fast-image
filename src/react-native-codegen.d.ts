// codegenNativeComponent, which React Native exports from 'react-native' since
// 0.80 (see src/specs/FastImageViewNativeComponent.ts). The types FastImage is
// checked against (0.76's) only declare its deep path.
import type { HostComponent } from 'react-native'

declare module 'react-native' {
    export function codegenNativeComponent<Props extends object>(
        componentName: string,
        options?: {
            interfaceOnly?: boolean
            paperComponentName?: string
            paperComponentNameDeprecated?: string
            excludedPlatforms?: ReadonlyArray<'iOS' | 'android'>
        },
    ): HostComponent<Props>
}
