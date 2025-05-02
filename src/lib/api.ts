import axios from 'axios';

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
        const { response } = err;
        if (!response) return console.log("API timed out. Please try again!");
        console.log(`Error ${response.status}: ${response.data?.message || response.data?.error || err.message}`);
    });
    return api;
}