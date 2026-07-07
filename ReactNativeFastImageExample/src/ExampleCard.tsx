import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { IconAvatar } from './IconAvatar'
import { useTheme } from './theme'

interface ExampleCardProps {
    icon?: string
    label?: string
    color: string
    title: string
    subtitle?: string
    featured?: boolean
    children?: React.ReactNode
}

export const ExampleCard = ({
    icon,
    label,
    color,
    title,
    subtitle,
    featured,
    children,
}: ExampleCardProps) => {
    const theme = useTheme()
    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: theme.cardBackground,
                    borderColor: featured ? color : 'transparent',
                },
            ]}
        >
            <View style={styles.header}>
                <IconAvatar name={icon} label={label} color={color} />
                <View style={styles.headerText}>
                    <Text style={[styles.title, { color: theme.textPrimary }]}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text
                            style={[
                                styles.subtitle,
                                { color: theme.textSecondary },
                            ]}
                        >
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
            </View>
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        borderWidth: 1.5,
        marginHorizontal: 20,
        marginVertical: 8,
        paddingTop: 16,
        paddingBottom: 4,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    headerText: {
        marginLeft: 12,
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 13,
        marginTop: 2,
    },
})
