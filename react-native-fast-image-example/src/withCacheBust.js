import React, { Component } from 'react'
import uuid from 'uuid/v4'

export default BaseComponent => {
    class WithCacheBust extends Component {
        state = { bust: '?bust' }

        onPressReload = () => {
            // Force complete re-render and bust image cache.
            const key = uuid()
            const bust = `?bust=${key}`
            this.setState({ bust })
        }

        render() {
            return (
                <BaseComponent
                    bust={this.state.bust}
                    onPressReload={this.onPressReload}
                />
            )
        }
    }

    WithCacheBust.displayName = `withCacheBust(${BaseComponent.displayName ||
        BaseComponent.name})`

    return WithCacheBust
}
