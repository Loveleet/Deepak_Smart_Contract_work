export type AddressBook = Record<string, string>;

export type ABIMap = Record<string, unknown>;

export interface DeploymentArtifacts {
  chain: string;
  addresses: AddressBook;
  abis: ABIMap;
  updatedAt: string;
}

export const emptyArtifacts = (): DeploymentArtifacts => ({
  chain: "",
  addresses: {},
  abis: {},
  updatedAt: new Date(0).toISOString()
});

export { deploymentArtifactsSchema } from "./schema.js";
