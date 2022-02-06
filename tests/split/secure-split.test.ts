import { SplitTestClient } from './shared/driver.test';
import {
    expectThrowsAsync,
} from "./shared/util";

describe("secure split lifetime", async () => {
    let client = new SplitTestClient();

    it("Arbitrary user is blocked from initiating withdrawal for a member", async () => {
        await client.initializeSplit(2, undefined, true);
        const members = await client.getMembers(client.splitAddress)[0];

        // even though we haven't allocated funds yet, the first check in the withdraw function
        // will prevent any further logic if payer != member in secure withdrawal scenario.
        expectThrowsAsync(async () => {
            await client.randomEntityWithdrawForMember(members[0].address);
        }, "Member must withdraw their own funds");
    });
});
