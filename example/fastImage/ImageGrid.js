// @flow
import React, { Component } from 'react'
import {
  StyleSheet,
  View,
  FlatList,
  Platform,
  StatusBar,
  Text,
} from 'react-native'

const getImageUrl = (id, width, height) =>
  `https://unsplash.it/${width}/${height}?image=${id}`

class ImageGrid extends Component {
  constructor(props: Object) {
    super(props)

    fetch('https://unsplash.it/list')
      .then(res => res.json())
      .then(this._onFetchImagesSuccess)
      .catch(this._onFetchImagesError)
  }

  state = {
    images: [],
    itemHeight: 0,
  }

  _onLayout = e => {
    const width = e.nativeEvent.layout.width
    this.setState({
      itemHeight: width / 4,
    })
  }

  _onFetchImagesError = () => {
    this.setState({
      error: true,
    })
  }

  _onFetchImagesSuccess = images => {
    this.setState({
      images,
    })
  }

  _getItemLayout = (data, index) => {
    const { itemHeight } = this.state
    return { length: itemHeight, offset: itemHeight * index, index }
  }

  _renderItem = ({ item }) => {
    const ImageComponent = this.props.ImageComponent
    const uri = getImageUrl(item.id, 100, 100)
    return (
      <View style={styles.imageContainer}>
        <ImageComponent source={{ uri }} style={styles.image} />
      </View>
    )
  }

  _extractKey = item => {
    return item.id
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Error fetching images.</Text>
        </View>
      )
    }
    return (
      <View style={styles.container}>
        <FlatList
          onLayout={this._onLayout}
          style={styles.list}
          columnWrapperStyle={[
            styles.columnWrapper,
            { height: this.state.itemHeight },
          ]}
          data={this.state.images}
          renderItem={this._renderItem}
          numColumns={4}
          keyExtractor={this._extractKey}
          getItemLayout={this._getItemLayout}
        />
        <View style={styles.statusBarUnderlay} />
      </View>
    )
  }
}

const MARGIN = 2
const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 20 : StatusBar.currentHeight

const styles = StyleSheet.create({
  statusBarUnderlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STATUS_BAR_HEIGHT,
    backgroundColor: 'white',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  list: {
    marginTop: STATUS_BAR_HEIGHT,
    flex: 1,
  },
  columnWrapper: {
    flex: 1,
    flexDirection: 'row',
    marginLeft: -MARGIN,
    marginRight: -MARGIN,
  },
  image: {
    flex: 1,
    width: null,
    height: null,
    margin: MARGIN,
    backgroundColor: '#eee',
  },
  imageContainer: {
    flex: 1,
    alignItems: 'stretch',
  },
})

export default ImageGrid
