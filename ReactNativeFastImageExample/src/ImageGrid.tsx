import React, { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, Text, View, LayoutChangeEvent } from 'react-native'
import StatusBarUnderlay, { useStatusBarHeight } from './StatusBarUnderlay'
import { imageUrl } from './imageServer'

const MARGIN = 2

export interface ImageGridItemProps {
    id: string
    ImageComponent: any
    testIDPrefix: string
}

export const ImageGridItem = memo(
    ({ id, ImageComponent, testIDPrefix }: ImageGridItemProps) => {
        const uri = imageUrl(`picsum/${id}-100x100.jpg`)
        // Lets maestro/walkthrough.yaml wait until the grid has loaded.
        const [loaded, setLoaded] = useState(false)
        return (
            <View
                // On the wrapper View rather than the image component: native
                // image views don't reliably expose test ID changes.
                testID={`${testIDPrefix}-${id}${loaded ? '-loaded' : ''}`}
                style={{
                    flex: 1,
                    alignItems: 'stretch',
                }}
            >
                <ImageComponent
                    onLoad={() => setLoaded(true)}
                    source={{ uri }}
                    style={{
                        flex: 1,
                        width: null as any,
                        height: null as any,
                        margin: MARGIN,
                        backgroundColor: '#eee',
                    }}
                />
            </View>
        )
    },
)

export interface ImageGridProps {
    ImageComponent: React.ComponentType<any>
    testIDPrefix: string
}

export const ImageGrid = (props: ImageGridProps) => {
    const statusBarHeight = useStatusBarHeight()
    const [images, setImages] = useState<any[]>([])
    const [itemHeight, setItemHeight] = useState(0)
    const [error, setError] = useState<Error | null>(null)

    useEffect(() => {
        fetch(imageUrl('picsum/list.json'))
            .then((res) => res.json())
            .then((d) => setImages(d))
            .catch((e) => setError(e))
    }, [])

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const width = e.nativeEvent.layout.width
        setItemHeight(width / 4)
    }, [])

    const getItemLayout = useCallback(
        (_: any, index: number) => {
            return { length: itemHeight, offset: itemHeight * index, index }
        },
        [itemHeight],
    )

    const { ImageComponent, testIDPrefix } = props

    const renderItem = useCallback(
        ({ item }: { item: any }) => {
            return (
                <ImageGridItem
                    id={item.id}
                    ImageComponent={ImageComponent}
                    testIDPrefix={testIDPrefix}
                />
            )
        },
        [ImageComponent, testIDPrefix],
    )

    const extractKey = useCallback((item: any) => {
        return item.id
    }, [])

    if (error) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'stretch',
                    justifyContent: 'center',
                    backgroundColor: 'white',
                }}
            >
                <Text
                    style={{
                        textAlign: 'center',
                    }}
                >
                    Error fetching images.
                </Text>
            </View>
        )
    }

    return (
        <View
            style={{
                flex: 1,
                alignItems: 'stretch',
                justifyContent: 'center',
                backgroundColor: 'white',
            }}
        >
            <FlatList
                onLayout={onLayout}
                style={{
                    marginTop: statusBarHeight,
                    flex: 1,
                }}
                columnWrapperStyle={[
                    {
                        flex: 1,
                        flexDirection: 'row',
                        marginLeft: -MARGIN,
                        marginRight: -MARGIN,
                    },
                    { height: itemHeight },
                ]}
                data={images}
                renderItem={renderItem}
                numColumns={4}
                keyExtractor={extractKey}
                getItemLayout={getItemLayout}
            />
            <StatusBarUnderlay />
        </View>
    )
}
