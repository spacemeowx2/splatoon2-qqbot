import {Client} from 'zerorpc'

export default class ZerorpcClient {
    client: Client = new Client()

    constructor(private host: string) {
        this.client.connect(host)
    }

    invoke<T>(name: string, ...args: any[]): Promise<[T, boolean]> {
        return new Promise((resolve, reject) => {
            args.push((error: Error | null, res: T, more: boolean) => {
                if (error) {
                    reject(error)
                } else {
                    resolve([res, more])
                }
            })
            this.client.invoke(name, ...args)
        })
    }
}
