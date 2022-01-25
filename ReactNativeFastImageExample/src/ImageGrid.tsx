import React, { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, Text, View, LayoutChangeEvent } from 'react-native'
import StatusBarUnderlay, { STATUS_BAR_HEIGHT } from './StatusBarUnderlay'

const getImageUrl = (id: string, width: number, height: number) =>
    `https://unsplash.it/${width}/${height}?image=${id}`

const MARGIN = 2

export interface ImageGridItemProps {
    id: string
    ImageComponent: any
}

export const ImageGridItem = memo(
    ({ id, ImageComponent }: ImageGridItemProps) => {
        const uri = getImageUrl(id, 100, 100)
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'stretch',
                }}
            >
                <ImageComponent
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
}

export const ImageGrid = (props: ImageGridProps) => {
    const [images, setImages] = useState<any[]>([])
    const [itemHeight, setItemHeight] = useState(0)
    const [error, setError] = useState<Error | null>(null)

    useEffect(() => {
        fetch('https://unsplash.it/list')
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

    const { ImageComponent } = props

    const renderItem = useCallback(
        ({ item }: { item: any }) => {
            return (
                <ImageGridItem id={item.id} ImageComponent={ImageComponent} />
            )
        },
        [ImageComponent],
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
                    marginTop: STATUS_BAR_HEIGHT,
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
