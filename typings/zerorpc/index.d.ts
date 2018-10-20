declare module 'zerorpc' {
    // Only declare client stuff to use for our project.
    export class Client {
        constructor()
        connect(host: string): any
        invoke(name: string, ...args: any[]): any
    }
}
