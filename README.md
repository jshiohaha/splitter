# splitter

**Disclaimer**: this code is untested in a production environment and should be used cautiously. It is provided as-is. Though, anyone is welcome to fork and modify.

Also — naming is hard. The best I could do in the moment was splitter. I know 🤦🏼‍♂️

## Description

The fanout wallet has been discussed for some time in the Solana ecosystem. I decided to take a stab at the problem over the course of a few days. My solution is arguably the most naive approach & thus has certain limitations. These will be discussed further below.

### Repository content
* `program` - fanout wallet smart-contract code
* `tests` - unit tests for program
* `sdk` - very basic client that can be used in any app or env that needs to interact with on-chain contract
* `app` - empty react app

### Design

The problem statement initially sounds straight forward: **create a contract that can receive funds and then fan those funds out to a group of wallets**. But, once I started dissecting the problem, I realized there's a lot of nuance, i.e.

* How do we keep track of incoming funds? Should there be an explicit transfer instruction? Or, should we enable any entity be allowed to transfer funds using the system transfer?
* How do you ensure a single entity or subset of parties cannot redeem more funds than they are entitled to?
* How do you keep track of who is entitled to the funds?
* Do you support both native SOL and SPL tokens?
* Do you support mutability of funds? If so, how?
* What does the redemption mechanism look like? Do you offer some off-chain crank that iterates through all wallet share owners? Do you require each owner to withdraw their own funds?
* How do shares get split? Does it happen automatically? Or, is it an explicit instruction that has to be cranked?

This is what I initially settled on:

* The `Split` PDA represents a single fanout wallet instance. It is immutable once initialized and stores all fanout wallet metadata.
* There is an on-chain Vec stored on the `Split` PDA. This Vec holds all members' addresses & the funds to which they are entitled.
* Anyone can call the `allocate_member_funds` instruction to split the current account's lamports, less lamports required for rent, based on the members' allocation percentages.
* Anyone can call the `withdraw` instruction. This instruction transfers a certain member's current allocation lamports to the recipient.

#### Pros
* Anyone can send SOL directly to the wallet.
* The wallets are actually composable. You can create a wallet A that feeds into wallets B, C, ..., Z. This isn't necessarily recommended due to the semi-complex logic this would require. But nevertheless, a cool outcome enabled by the design.
* It's relatively simple to understand. All you really need to do is init, allocation funds, withdraw, and close account once done.
* You can close the account & redeem the lamports once the wallet is empty.

#### Cons
* This design only supports native SOL out of the box. It might be extensible to any SPL tokens, but it would require some additional logic.
* Because we use a Vec to store recipient addresses and share, it is limited due to the Solana account size limitations.
* The Vec of recipients cannot be mutable without much more complex logic/mechanism design.
* The number of each wallet's members & shares is limited — due to both the choice to use percentages instead of basis points and the choice to use a Vec.
* 
### Learnings, Takeaways, and Improvements
* I naively used percentage points. I should have used basis points to enable more granular ownership percentage. The percent model only allows a 1% share granularity while basis points allows for 0.01%.
* Mutability is difficult.
* Finding the right UX — even the simple question of how to allow funds to enter the wallet is difficult, e.g. can someone directly transfer tokens or do they have to call an instruction? There are instances where the latter would not work, e.g. secondary NFT markets transferring royalties.
* It would be more web3 native to use SPL tokens (regardless of mint decimals, so yes this could include NFTs 🙂) to represent shares of a fanout wallet. The major beneift here is that it allows anyone to trade rights to funds. Possible arb opportunity for the degens out there.

Even though this is not the most robust solution, it was fun to think about & implement over the course of a few days.

## Installation

There are a couple things to build and install before rocking & rolling:

1. Run `anchor build`. This will build the split smart contract.
2. Build the SDK. Run `cd sdk && yarn && yarn build`.
3. Navigate back to the top-level directory. 
4. Make sure you have `ts-mocha` installed globally via `npm i -g ts-mocha`
5. Run tests with `anchor test`

### License
Do whatever you like with this code. MIT license: https://mit-license.org/
