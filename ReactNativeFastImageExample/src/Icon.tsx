import React from 'react'
import { Ionicons } from '@react-native-vector-icons/ionicons/static'

interface IconProps {
    size?: number
    name: React.ComponentProps<typeof Ionicons>['name']
    color: string
}

export function Icon({ size, name, color }: IconProps) {
    return (
        <Ionicons
            name={name}
            size={size}
            style={{ width: size, height: size }}
            color={color}
        />
    )
}
