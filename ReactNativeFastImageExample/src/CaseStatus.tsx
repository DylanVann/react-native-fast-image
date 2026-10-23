import React, { createContext, useContext, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
    DescribeContext,
    Description,
    InRunnerContext,
    useReport,
} from './RunnerContext'

// Whether descriptions show their steps and what to see, or only what they
// check (the Regression tab's Details switch).
export const DetailsContext = createContext(false)

// A case's status line ("<id>: OK" once it passed, "<id>: …" until then) and
// description. The runner is told the status in full (RunnerContext.tsx) and
// lists the ones that aren't OK below the cases; the line itself stays short,
// so a long status (a failure) doesn't move the cases below, whose areas were
// measured for masks and video samples, and it isn't cut off. In the runner
// it shows nothing (the screenshots have the cases' images only), and gives
// the runner its description.
export function CaseStatus({
    id,
    status,
    description,
}: {
    id: string
    status: string
    description: Description
}) {
    useReport(id, status)
    const describe = useContext(DescribeContext)
    useEffect(() => describe(id, description), [describe, id, description])
    const inRunner = useContext(InRunnerContext)
    if (inRunner) return null
    return (
        <View style={caseStyles.text}>
            <Text testID={`regression-${id}`} style={caseStyles.status}>
                {id}: {status === 'OK' ? 'OK' : '…'}
            </Text>
            <DescriptionText description={description} />
        </View>
    )
}

// What a case or group checks, and with details on, its steps and what it
// shows.
export function DescriptionText({ description }: { description: Description }) {
    const details = useContext(DetailsContext)
    return (
        <>
            <Text style={caseStyles.description}>{description.checks}</Text>
            {details && description.steps ? (
                <Text style={caseStyles.description}>
                    <Text style={caseStyles.label}>Steps: </Text>
                    {description.steps}
                </Text>
            ) : null}
            {details ? (
                <Text style={caseStyles.description}>
                    <Text style={caseStyles.label}>Shows: </Text>
                    {description.shows}
                </Text>
            ) : null}
        </>
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
    label: {
        fontWeight: '600',
    },
})
