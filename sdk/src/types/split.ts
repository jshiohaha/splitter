export type Split = {
  "version": "0.1.0",
  "name": "split",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        },
        {
          "name": "isSecureWithdrawal",
          "type": "bool"
        },
        {
          "name": "members",
          "type": {
            "vec": {
              "defined": "Member"
            }
          }
        }
      ]
    },
    {
      "name": "allocateMemberFunds",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    },
    {
      "name": "withdraw",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "member",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    },
    {
      "name": "close",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "split",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "seed",
            "type": "string"
          },
          {
            "name": "isSecureWithdrawal",
            "type": "bool"
          },
          {
            "name": "initializedAt",
            "type": "u64"
          },
          {
            "name": "initializer",
            "type": "publicKey"
          },
          {
            "name": "lastWithdrawal",
            "type": "u64"
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": "Member"
              }
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "publicKey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "share",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "NoRedeemableFunds",
      "msg": "No redeemable funds"
    },
    {
      "code": 6001,
      "name": "MemberWithAddressDoesNotExist",
      "msg": "Member with address does not exist"
    },
    {
      "code": 6002,
      "name": "InsufficientAccountBalance",
      "msg": "Insufficient account balance"
    },
    {
      "code": 6003,
      "name": "MembersFundsHaveNotBeenWithdrawn",
      "msg": "Please withdraw all member funds before taking this action"
    },
    {
      "code": 6004,
      "name": "InvalidMemberShare",
      "msg": "Total member share must be 100 percent"
    },
    {
      "code": 6005,
      "name": "NotAuthorizedToWithdrawFunds",
      "msg": "Member must withdraw their own funds"
    },
    {
      "code": 6006,
      "name": "CheckedRemError",
      "msg": "Checked REM error"
    },
    {
      "code": 6007,
      "name": "NumericalOverflowError",
      "msg": "Numerical overflow error"
    },
    {
      "code": 6008,
      "name": "NumericalUnderflowError",
      "msg": "Numerical underflow error"
    }
  ]
};

export const IDL: Split = {
  "version": "0.1.0",
  "name": "split",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        },
        {
          "name": "isSecureWithdrawal",
          "type": "bool"
        },
        {
          "name": "members",
          "type": {
            "vec": {
              "defined": "Member"
            }
          }
        }
      ]
    },
    {
      "name": "allocateMemberFunds",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    },
    {
      "name": "withdraw",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "member",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    },
    {
      "name": "close",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "split",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "seed",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "split",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "seed",
            "type": "string"
          },
          {
            "name": "isSecureWithdrawal",
            "type": "bool"
          },
          {
            "name": "initializedAt",
            "type": "u64"
          },
          {
            "name": "initializer",
            "type": "publicKey"
          },
          {
            "name": "lastWithdrawal",
            "type": "u64"
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": "Member"
              }
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "publicKey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "share",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "NoRedeemableFunds",
      "msg": "No redeemable funds"
    },
    {
      "code": 6001,
      "name": "MemberWithAddressDoesNotExist",
      "msg": "Member with address does not exist"
    },
    {
      "code": 6002,
      "name": "InsufficientAccountBalance",
      "msg": "Insufficient account balance"
    },
    {
      "code": 6003,
      "name": "MembersFundsHaveNotBeenWithdrawn",
      "msg": "Please withdraw all member funds before taking this action"
    },
    {
      "code": 6004,
      "name": "InvalidMemberShare",
      "msg": "Total member share must be 100 percent"
    },
    {
      "code": 6005,
      "name": "NotAuthorizedToWithdrawFunds",
      "msg": "Member must withdraw their own funds"
    },
    {
      "code": 6006,
      "name": "CheckedRemError",
      "msg": "Checked REM error"
    },
    {
      "code": 6007,
      "name": "NumericalOverflowError",
      "msg": "Numerical overflow error"
    },
    {
      "code": 6008,
      "name": "NumericalUnderflowError",
      "msg": "Numerical underflow error"
    }
  ]
};
