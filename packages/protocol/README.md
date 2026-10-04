# @tessera-kit/protocol

Zod schemas and inferred types for the Tessera wire protocol and REST DTOs, shared by clients and `tessera-server`.

```ts
import { ClientMsg, decodeServerFrame, TopicSchemas } from '@tessera-kit/protocol';

const frame = decodeServerFrame(event.data);
if (frame.ok && frame.msg.t === 'msg') handle(frame.msg);
```

| Export | Purpose |
| --- | --- |
| `ClientMsg`, `ServerMsg` | Discriminated unions on `t` for every frame |
| `decodeClientFrame`, `decodeServerFrame` | `JSON.parse` + validate; return `{ ok, msg }` or `{ ok: false, reason }` |
| `RoomName`, `Topic` | Name formats (`app/kind:id`, `kind.event`) |
| `ErrorSchema`, `ERROR_CODES` | Error payloads and the shared code list |
| `TopicSchemas`, `BroadcastSchemas` | Request/response and broadcast payloads per topic (chat, `doc.changed`) |
| `DocDto`, `DocListQuery`, `DocPutBody`, `IceRes`, `UploadRes`, … | REST shapes |
| `encodeWhereValue`, `whereCandidates` | Typed `where[field]` filter values over query strings |
| `PROTOCOL_VERSION`, `MAX_FRAME_BYTES`, `CloseCode` | Constants |

Details, close codes and client behaviour are in the [wire protocol reference](https://thakurabhishek7283.github.io/tessera/reference/protocol).
