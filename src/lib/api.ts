import axios from 'axios';
import { log } from './log';

export function getApiClient(token: string) {
    const api = axios.create({
        baseURL: 'https://api.optimizely.com/v2',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 10000,
    });
    api.interceptors.response.use((res) => res, (err) => {
        const { response, config } = err;
        if (!response) return log.error("API timed out. Please try again!");
        log.error(`Error ${response.status}: ${response.data?.message || response.data?.error || err.message}`);

        if (response?.data?.message && config.method === 'post' && config.url.match(/pages\/\d+\/events/gi)) {
            const foundIdMatch = response.data.message.match(/already\sin\suse.+\(id:\s(\d+)\).+/i);
            if (foundIdMatch) {
                throw new Error(`Found a duplicate with id ${foundIdMatch[1]}`);
            }
        }
    });
    return api;
}