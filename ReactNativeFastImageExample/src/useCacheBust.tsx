import { useCallback, useState } from 'react'

const getNewKey = () => Math.random().toString()

export const useCacheBust = (
    url: string,
): { bust: () => void; url: string; query: string } => {
    const [key, setKey] = useState(getNewKey())
    const bust = useCallback(() => {
        setKey(getNewKey())
    }, [])
    const query = `?bust=${key}`
    return {
        url: `${url}${query}`,
        query,
        bust,
    }
}
