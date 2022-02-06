# ------- copy IDL and types
# IDL to app
cp ./target/idl/split.json ./app/split/public/

# ------- types to SDK
cp -r ./target/types ./sdk/src/

echo IDLs and Types copied ✅