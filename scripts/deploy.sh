# fetch old pk
old_split_pk=`solana-keygen pubkey ./target/deploy/split-keypair.json`
echo OLD SPLIT PK: $old_split_pk

# stash old keypair
cd ./target/deploy #need to cd for renaming to work ok
mv split-keypair.json split-keypair-`ls | wc -l | xargs`.json
cd ./../..

# build and fetch new pk
anchor build
new_split_pk=`solana-keygen pubkey ./target/deploy/split-keypair.json`
echo BUILT, NEW SPLIT PK: $new_split_pk

sed -i'.original' -e "s/$old_split_pk/$new_split_pk/g" ./Anchor.toml
sed -i'.original' -e "s/$old_split_pk/$new_split_pk/g" ./programs/split/src/lib.rs
# replace in other files as well. maybe grep & grab files so we don't have to manually update this?
echo SPLIT REPLACED!

# build again with new pk
anchor build

# copy idl
# cp ./target/idl/split.json ./app/split/public

# deploy!
# solana balance # enough lamports left for deployment?
# anchor deploy --provider.cluster devnet
# echo DEPLOYED TO DEVNET
# solana balance