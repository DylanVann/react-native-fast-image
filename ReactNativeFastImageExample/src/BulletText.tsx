import React from 'react'
import FeatureText from './FeatureText'

interface BulletTextProps {
    text?: string
    children?: any
}

const BulletText = ({ text, children }: BulletTextProps) => (
    <FeatureText text={`• ${text || children} •`} />
)

export default BulletText
