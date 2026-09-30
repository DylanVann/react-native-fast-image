import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useReport } from './RunnerContext'

// A case's status line ("<id>: OK" once it passed, "<id>: …" until then) and
// description. The runner is told the status in full (RunnerContext.tsx) and
// lists the ones that aren't OK below the cases; the line itself stays short,
// so a long status (a failure) doesn't move the cases below, whose areas were
// measured for masks and video samples, and it isn't cut off.
export function CaseStatus({
    id,
    status,
    description,
}: {
    id: string
    status: string
    description: React.ReactNode
}) {
    useReport(id, status)
    return (
        <View style={caseStyles.text}>
            <Text testID={`regression-${id}`} style={caseStyles.status}>
                {id}: {status === 'OK' ? 'OK' : '…'}
            </Text>
            <Text style={caseStyles.description}>{description}</Text>
        </View>
    )
}

export const caseStyles = StyleSheet.create({
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    image: {
        width: 48,
        height: 48,
        backgroundColor: '#eee',
    },
    gap: {
        marginLeft: 8,
    },
    text: {
        flex: 1,
        marginLeft: 12,
    },
    status: {
        fontWeight: '600',
    },
    description: {
        color: '#666',
        marginTop: 2,
    },
})
