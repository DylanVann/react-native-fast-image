import React from 'react'
import FeatureText from './FeatureText'

const BulletText = ({ text, children }) => (
    <FeatureText text={`• ${text || children} •`} />
)

export default BulletText
