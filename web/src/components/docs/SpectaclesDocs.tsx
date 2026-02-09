export function SpectaclesDocs() {
  return (
    <article className="docs-article">
      <h1>Spectacles AR Client</h1>
      <p className="docs-lead">
        Snap Spectacles AR client for Eywa. Renders agent memory, context, and
        chat as floating quads in world space, streamed from a web renderer via
        Supabase Realtime. The Spectacles don't run a full browser. Instead, a
        web app renders each UI element (memory cards, agent dots, buttons, chat
        bubbles) as tiny JPEG textures on OffscreenCanvases, broadcasts them
        over Supabase Realtime, and the glasses decode and paint them onto 3D
        quads.
      </p>

      <h2>Streaming Pipeline</h2>
      <p>
        The web dashboard at <code>/r/&#123;room-slug&#125;/spectacles</code>{" "}
        serves as the broadcaster. It maintains a Supabase Realtime channel and
        streams room activity, Gemini chat, and destination progress to
        connected Spectacles devices.
      </p>
      <pre className="docs-code"><code>{`Web (SpectaclesView.tsx)
  computeLayout() -> TileDescriptor[]
  TileScene.reconcile() -> create/destroy/move ops
  TileScene.renderDirty() -> OffscreenCanvas -> base64 JPEG
  channel.send("scene", ops)        <- JSON, batched
  channel.send("tex", {id, image})  <- JPEG per tile
        |
        | Supabase Realtime broadcast
        v
Spectacles (TilePanel.ts)
  RealtimeTextureReceiver -> subscribe to channel
  onScene -> create/move/destroy quads (+ groups)
  onTex -> Base64.decodeTextureAsync -> material.mainPass.baseTex
  Quad renders in world space`}</code></pre>
      <p>
        Each tile is its own quad with its own cloned material. Only dirty tiles
        re-render and re-broadcast. Most tiles broadcast exactly once.
      </p>

      <h2>Protocol</h2>

      <h3>Channels</h3>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>spectacles:&#123;room&#125;:lobby</code></td>
            <td>Device discovery (heartbeat, connect, disconnect)</td>
          </tr>
          <tr>
            <td><code>spectacles:&#123;room&#125;:&#123;deviceId&#125;</code></td>
            <td>Tile streaming (scene ops + textures)</td>
          </tr>
          <tr>
            <td><code>spectacles:&#123;room&#125;</code></td>
            <td>Default channel when no device ID</td>
          </tr>
        </tbody>
      </table>

      <h3>Events</h3>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Direction</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>scene</code></td>
            <td>web -&gt; glasses</td>
            <td>
              <code>&#123;op, id, x, y, w, h, ...&#125;</code> or{" "}
              <code>&#123;ops: [...]&#125;</code>
            </td>
          </tr>
          <tr>
            <td><code>tex</code></td>
            <td>web -&gt; glasses</td>
            <td>
              <code>&#123;id, image&#125;</code> (image is raw base64 JPEG)
            </td>
          </tr>
          <tr>
            <td><code>interact</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;id, type, x, y, u, v, timestamp&#125;</code> (type:
              tap, hover, hover_move, hover_exit)
            </td>
          </tr>
          <tr>
            <td><code>camera</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;x, y, z, wx, wy, wz, ts&#125;</code> (local + world
              position)
            </td>
          </tr>
          <tr>
            <td><code>layout</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;actions: [...], timestamp&#125;</code> (gesture-driven
              layout changes)
            </td>
          </tr>
          <tr>
            <td><code>sync_request</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;deviceId, timestamp&#125;</code> (request full tile
              resync)
            </td>
          </tr>
          <tr>
            <td><code>device_connect</code></td>
            <td>glasses -&gt; lobby</td>
            <td>
              <code>&#123;deviceId, channelName, timestamp&#125;</code>
            </td>
          </tr>
          <tr>
            <td><code>device_heartbeat</code></td>
            <td>glasses -&gt; lobby</td>
            <td>
              <code>&#123;deviceId, channelName, timestamp&#125;</code>
            </td>
          </tr>
          <tr>
            <td><code>voice_input</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;text, timestamp&#125;</code> (user speech
              transcription)
            </td>
          </tr>
          <tr>
            <td><code>voice_response</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;text, timestamp&#125;</code> (Gemini response
              transcription)
            </td>
          </tr>
          <tr>
            <td><code>voice_inject</code></td>
            <td>glasses -&gt; web</td>
            <td>
              <code>&#123;message, priority, timestamp&#125;</code> (injected to
              room)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Scene Ops</h3>
      <ul>
        <li>
          <code>create</code> - new quad:{" "}
          <code>
            &#123;op:"create", id, x, y, z, w, h, layer, group, interactive,
            s&#125;
          </code>
        </li>
        <li>
          <code>destroy</code> - remove quad:{" "}
          <code>&#123;op:"destroy", id&#125;</code>
        </li>
        <li>
          <code>visibility</code> - show/hide:{" "}
          <code>&#123;op:"visibility", id, visible&#125;</code>
        </li>
        <li>
          <code>group</code> - create/position a group container:{" "}
          <code>&#123;op:"group", id, x, y, z, visible&#125;</code>
        </li>
        <li>
          <code>group-destroy</code> - remove a group and all its children:{" "}
          <code>&#123;op:"group-destroy", id&#125;</code>
        </li>
        <li>
          <code>move</code> / <code>group-move</code> - currently ignored
          (static layout after creation)
        </li>
      </ul>

      <h2>Setup</h2>

      <h3>1. Lens Studio Project</h3>
      <p>
        Open <code>eywa-specs.esproj</code> in Lens Studio.
      </p>

      <h3>2. Supabase Plugin</h3>
      <p>
        Window &gt; Supabase &gt; Login &gt; Import Credentials. This creates a
        SupabaseProject asset.
      </p>

      <h3>3. Scene Hierarchy</h3>
      <pre className="docs-code"><code>{`CloudManager          <- SnapCloudRequirements script, assign SupabaseProject
Camera
EywaPanel             <- TilePanel script
  material: Unlit     <- assign the Unlit material from Assets
  channelName: demo   <- your room slug
  deviceId: editor    <- or leave empty for auto-ID`}</code></pre>

      <h3>4. Web Broadcaster</h3>
      <p>
        Navigate to <code>/r/&#123;room-slug&#125;/spectacles</code> in the
        Eywa web app. Click "Start Broadcast". The page renders tiles and
        streams them to any connected Spectacles device.
      </p>

      <h3>5. Test in Editor</h3>
      <p>
        Push to device or use Lens Studio preview. Check the Logger panel for
        connection and tile events:
      </p>
      <pre className="docs-code"><code>{`[TilePanel] Initializing, device: editor
[RealtimeTextureReceiver] Subscribing to: spectacles:demo:editor
[RealtimeTextureReceiver] SUCCESS: Subscribed to spectacles:demo:editor
[TilePanel] onScene: {"op":"create","id":"header","x":0,"y":10,...}
[TilePanel] onTex: id=header imgLen=8234
[TilePanel] + header at (0.0,10.0,0.05) 25.0x7.5cm`}</code></pre>

      <h2>Voice Interface (EywaGeminiLive)</h2>
      <p>
        Spectacles have a bidirectional voice interface powered by Gemini Live.
        The user speaks, Gemini responds with audio, and transcriptions relay to
        the web dashboard in real time. Gemini can also inject messages to the
        room, letting users steer the agent swarm by voice.
      </p>
      <h3>How It Works</h3>
      <ol>
        <li>
          On init, <code>EywaGeminiLive.ts</code> fetches recent memories and
          the destination from Supabase
        </li>
        <li>
          That context becomes Gemini's system instructions ("You are Eywa, a
          voice assistant for navigating an agent swarm")
        </li>
        <li>
          Mic audio streams to Gemini Live via Snap's WebSocket proxy (no API
          key needed)
        </li>
        <li>
          Gemini responds with audio (played on the glasses) and text
          transcription
        </li>
        <li>
          Transcriptions relay to the web via the broadcast channel (
          <code>voice_input</code>, <code>voice_response</code>,{" "}
          <code>voice_inject</code> events)
        </li>
        <li>
          Gemini has an <code>inject_message</code> tool that writes directly to
          the Supabase memories table, making the message visible to all agents
          in the room
        </li>
      </ol>

      <h3>Broadcast Events</h3>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Direction</th>
            <th>Payload</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>voice_input</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;text, timestamp&#125;</code></td>
            <td>User speech transcription</td>
          </tr>
          <tr>
            <td><code>voice_response</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;text, timestamp&#125;</code></td>
            <td>Gemini response transcription</td>
          </tr>
          <tr>
            <td><code>voice_inject</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;message, priority, timestamp&#125;</code></td>
            <td>Message injected to room</td>
          </tr>
        </tbody>
      </table>

      <h3>Testing Without Spectacles</h3>
      <p>
        Run the web app and open the Spectacles broadcast page. Then simulate
        voice events from the browser console:
      </p>
      <pre className="docs-code"><code>{`cd web && npm run dev
# Open http://localhost:5173/r/demo/spectacles

# In the browser console:
const {supabase} = await import('/src/lib/supabase.ts')
const ch = supabase.channel('spectacles:demo:editor', {config:{broadcast:{self:true}}})
ch.subscribe(s => console.log('channel:', s))

// Once subscribed:
ch.send({type:'broadcast', event:'voice_input',
  payload:{text:'What are the agents working on?', timestamp:Date.now()}})

ch.send({type:'broadcast', event:'voice_response',
  payload:{text:'12 active agents, mostly working on demo polish.', timestamp:Date.now()}})

ch.send({type:'broadcast', event:'voice_inject',
  payload:{message:'Focus on the Spectacles milestone', timestamp:Date.now()}})`}</code></pre>

      <h2>Marker Tracking (Optional)</h2>
      <p>
        The scene uses Extended Marker Tracking to optionally anchor the AR
        panel to a physical display. A marker is not required. The panel appears
        at a default position automatically.
      </p>

      <h3>Default Mode (No Marker)</h3>
      <ol>
        <li>
          On launch, a 2-second warmup guard ignores false positive detections
          from the first frames
        </li>
        <li>
          After 3 seconds with no marker detected, the panel auto-detaches to a
          default position: 65cm forward, 3cm below eye level
        </li>
        <li>
          If a marker is detected later, the panel repositions to the marker
          location
        </li>
        <li>Spectacles' IMU handles orientation tracking after placement</li>
      </ol>

      <h3>Marker Mode</h3>
      <ol>
        <li>
          Spectacles camera detects the tracking marker pattern on a physical
          display
        </li>
        <li>
          The AR panel spawns at the marker position (children start disabled,
          enabled on detection)
        </li>
        <li>
          With <code>trackMarkerOnce: true</code>, the marker is detected once,
          the panel detaches to world space, and marker tracking is disabled to
          save performance
        </li>
      </ol>

      <h3>Scene Hierarchy</h3>
      <pre className="docs-code"><code>{`Extended_Marker_Tracking (root)
  Object 1 [MarkerTrackingComponent]
    RealtimePanel [TilePanel]   <- auto-places after 3s or on marker detection`}</code></pre>

      <h2>Troubleshooting</h2>

      <h3>"SnapCloudRequirements not configured"</h3>
      <p>Assign the SupabaseProject asset in the Inspector.</p>

      <h3>Channel subscribes but no events arrive</h3>
      <ul>
        <li>
          Check channel names match: web sends on{" "}
          <code>spectacles:&#123;slug&#125;:&#123;deviceId&#125;</code>,
          Spectacles subscribes to the same
        </li>
        <li>
          Open browser console on the web side and verify "SUBSCRIBED" status
        </li>
        <li>Default deviceId is "editor" on both sides</li>
      </ul>

      <h3>Test quads appear but no streamed tiles</h3>
      <ul>
        <li>
          Enable <code>showTestQuads</code> in Inspector to verify the
          mesh/material pipeline
        </li>
        <li>Check Logger for "scene event" or "tex event" messages</li>
        <li>
          If no events, the channel subscription might be failing. Check for
          auth or network errors
        </li>
      </ul>

      <h3>Textures fail to decode</h3>
      <ul>
        <li>
          Base64 string might be too large. Check JPEG quality settings in
          tileRenderers.ts
        </li>
        <li>
          Supabase Realtime has a ~1MB message limit. Individual tile textures
          are typically 5-15KB
        </li>
      </ul>

      <h3>Quads visible but wrong size or position</h3>
      <ul>
        <li>
          <code>pixelsPerCm</code> controls scaling: width_cm = pixel_width /
          pixelsPerCm
        </li>
        <li>Positions are in cm, centered at the panel origin</li>
        <li>
          Layer Z offsets: 0=0.05cm, 1=1.5cm, 2=2.5cm, 3=3.5cm
        </li>
      </ul>

      <h2>Ergonomics</h2>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Comfort distance</td>
            <td>65 cm</td>
          </tr>
          <tr>
            <td>Comfort rectangle</td>
            <td>~47 x 28 cm</td>
          </tr>
          <tr>
            <td>Default tile</td>
            <td>14 cm with 1.5 cm gap</td>
          </tr>
          <tr>
            <td>Body text minimum</td>
            <td>0.5 cm height</td>
          </tr>
          <tr>
            <td>Tap target minimum</td>
            <td>2.0 x 2.0 cm</td>
          </tr>
        </tbody>
      </table>

      <h2>Dependencies</h2>
      <ul>
        <li>Lens Studio (latest)</li>
        <li>
          SpectaclesInteractionKit.lspkg (hand tracking, pinch, Interactable)
        </li>
        <li>SupabaseClient.lspkg (Snap's Supabase SDK for Lens Studio)</li>
        <li>Supabase project with Realtime enabled</li>
      </ul>
    </article>
  );
}
