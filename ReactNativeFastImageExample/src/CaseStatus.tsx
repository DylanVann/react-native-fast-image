import React, { createContext, useContext, useEffect, useRef } from 'react'
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native'
import {
    CaseAreaContext,
    DescribeContext,
    Description,
    GroupDescription,
    InRunnerContext,
    measureView,
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
// the runner its description and area.
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
    useEffect(() => {
        describe(id, description)
    }, [describe, id, description])
    const inRunner = useContext(InRunnerContext)
    if (inRunner) return <CaseArea id={id} />
    return (
        <View style={caseStyles.text}>
            <Text testID={`regression-${id}`} style={caseStyles.status}>
                {id}: {status === 'OK' ? 'OK' : '…'}
            </Text>
            <DescriptionText description={description} />
        </View>
    )
}

// An invisible view over the case's row (the view CaseStatus is in), which
// the runner measures as the case's area.
function CaseArea({ id }: { id: string }) {
    const register = useContext(CaseAreaContext)
    const ref = useRef<React.ComponentRef<typeof View>>(null)
    useEffect(
        () => register(id, () => measureView(ref.current)),
        [register, id],
    )
    return (
        <View
            ref={ref}
            collapsable={false}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
        />
    )
}

// What a case or group checks (after its title, for a group), and with
// details on, its steps and what it shows. One Text, so the Regression tab's
// accessibility tree, which the Maestro flows read, doesn't grow with them.
export function DescriptionText({
    description,
    title,
    style,
}: {
    description: GroupDescription
    title?: string
    style?: StyleProp<TextStyle>
}) {
    const details = useContext(DetailsContext)
    return (
        <Text style={[caseStyles.description, style]}>
            {title ? (
                <Text style={caseStyles.heading}>
                    {title}
                    {'\n'}
                </Text>
            ) : null}
            {description.checks}
            {details && description.steps ? (
                <>
                    {'\n'}
                    <Text style={caseStyles.label}>Steps: </Text>
                    {description.steps}
                </>
            ) : null}
            {details && description.shows ? (
                <>
                    {'\n'}
                    <Text style={caseStyles.label}>Shows: </Text>
                    {description.shows}
                </>
            ) : null}
        </Text>
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
    heading: {
        color: 'black',
        fontWeight: '600',
    },
})
