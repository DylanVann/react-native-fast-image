import React, { Component } from 'react'

export default function withCacheBust(BaseComponent: React.ComponentType<any>) {
    class WithCacheBust extends Component {
        state = { bust: '?bust' }

        static displayName = `withCacheBust(${BaseComponent.displayName ||
            BaseComponent.name})`

        onPressReload = () => {
            // Force complete re-render and bust image cache.
            const key = Math.random().toString()
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

    return WithCacheBust
}
