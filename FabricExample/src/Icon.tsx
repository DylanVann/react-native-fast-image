import React from 'react'
import Base from 'react-native-vector-icons/Ionicons'

interface IconProps {
    size?: number
    name: string
    color: string
}

export function Icon({ size, name, color }: IconProps) {
    return (
        <Base
            name={name}
            size={size}
            style={{ width: size, height: size }}
            color={color}
        />
    )
}
