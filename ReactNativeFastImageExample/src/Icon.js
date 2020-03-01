import React from 'react'
import Base from 'react-native-vector-icons/Ionicons'

export function Icon({ size, name, color }) {
    console.log(size, name, color)
    return (
        <Base
            name={name}
            size={size}
            style={{ width: size, height: size }}
            color={color}
        />
    )
}
