import { useTranslation } from "react-i18next";

export function SpectaclesDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("spectacles.title")}</h1>
      <p className="docs-lead">{t("spectacles.lead")}</p>

      <h2>{t("spectacles.streamingPipeline.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("spectacles.streamingPipeline.text") }} />
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
      <p>{t("spectacles.streamingPipeline.dirty")}</p>

      <h2>{t("spectacles.protocol.heading")}</h2>

      <h3>{t("spectacles.protocol.channels.heading")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("spectacles.protocol.channels.col.channel")}</th>
            <th>{t("spectacles.protocol.channels.col.purpose")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>spectacles:&#123;room&#125;:lobby</code></td>
            <td>{t("spectacles.protocol.channels.lobby")}</td>
          </tr>
          <tr>
            <td><code>spectacles:&#123;room&#125;:&#123;deviceId&#125;</code></td>
            <td>{t("spectacles.protocol.channels.device")}</td>
          </tr>
          <tr>
            <td><code>spectacles:&#123;room&#125;</code></td>
            <td>{t("spectacles.protocol.channels.default")}</td>
          </tr>
        </tbody>
      </table>

      <h3>{t("spectacles.protocol.events.heading")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("spectacles.protocol.events.col.event")}</th>
            <th>{t("spectacles.protocol.events.col.direction")}</th>
            <th>{t("spectacles.protocol.events.col.payload")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>scene</code></td>
            <td>web -&gt; glasses</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.scene.payload") }} />
          </tr>
          <tr>
            <td><code>tex</code></td>
            <td>web -&gt; glasses</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.tex.payload") }} />
          </tr>
          <tr>
            <td><code>interact</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.interact.payload") }} />
          </tr>
          <tr>
            <td><code>camera</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.camera.payload") }} />
          </tr>
          <tr>
            <td><code>layout</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.layout.payload") }} />
          </tr>
          <tr>
            <td><code>sync_request</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.syncRequest.payload") }} />
          </tr>
          <tr>
            <td><code>device_connect</code></td>
            <td>glasses -&gt; lobby</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.deviceConnect.payload") }} />
          </tr>
          <tr>
            <td><code>device_heartbeat</code></td>
            <td>glasses -&gt; lobby</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.deviceHeartbeat.payload") }} />
          </tr>
          <tr>
            <td><code>voice_input</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.voiceInput.payload") }} />
          </tr>
          <tr>
            <td><code>voice_response</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.voiceResponse.payload") }} />
          </tr>
          <tr>
            <td><code>voice_inject</code></td>
            <td>glasses -&gt; web</td>
            <td dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.events.voiceInject.payload") }} />
          </tr>
        </tbody>
      </table>

      <h3>{t("spectacles.protocol.sceneOps.heading")}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.create") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.destroy") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.visibility") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.group") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.groupDestroy") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.protocol.sceneOps.move") }} />
      </ul>

      <h2>{t("spectacles.setup.heading")}</h2>

      <h3>{t("spectacles.setup.lensStudio.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("spectacles.setup.lensStudio.text") }} />

      <h3>{t("spectacles.setup.supabasePlugin.heading")}</h3>
      <p>{t("spectacles.setup.supabasePlugin.text")}</p>

      <h3>{t("spectacles.setup.sceneHierarchy.heading")}</h3>
      <pre className="docs-code"><code>{`CloudManager          <- SnapCloudRequirements script, assign SupabaseProject
Camera
EywaPanel             <- TilePanel script
  material: Unlit     <- assign the Unlit material from Assets
  channelName: demo   <- your room slug
  deviceId: editor    <- or leave empty for auto-ID`}</code></pre>

      <h3>{t("spectacles.setup.webBroadcaster.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("spectacles.setup.webBroadcaster.text") }} />

      <h3>{t("spectacles.setup.testInEditor.heading")}</h3>
      <p>{t("spectacles.setup.testInEditor.text")}</p>
      <pre className="docs-code"><code>{`[TilePanel] Initializing, device: editor
[RealtimeTextureReceiver] Subscribing to: spectacles:demo:editor
[RealtimeTextureReceiver] SUCCESS: Subscribed to spectacles:demo:editor
[TilePanel] onScene: {"op":"create","id":"header","x":0,"y":10,...}
[TilePanel] onTex: id=header imgLen=8234
[TilePanel] + header at (0.0,10.0,0.05) 25.0x7.5cm`}</code></pre>

      <h2>{t("spectacles.voiceInterface.heading")}</h2>
      <p>{t("spectacles.voiceInterface.text")}</p>
      <h3>{t("spectacles.voiceInterface.howItWorks.heading")}</h3>
      <ol>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.voiceInterface.howItWorks.step1") }} />
        <li>{t("spectacles.voiceInterface.howItWorks.step2")}</li>
        <li>{t("spectacles.voiceInterface.howItWorks.step3")}</li>
        <li>{t("spectacles.voiceInterface.howItWorks.step4")}</li>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.voiceInterface.howItWorks.step5") }} />
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.voiceInterface.howItWorks.step6") }} />
      </ol>

      <h3>{t("spectacles.voiceInterface.broadcastEvents.heading")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("spectacles.voiceInterface.broadcastEvents.col.event")}</th>
            <th>{t("spectacles.voiceInterface.broadcastEvents.col.direction")}</th>
            <th>{t("spectacles.voiceInterface.broadcastEvents.col.payload")}</th>
            <th>{t("spectacles.voiceInterface.broadcastEvents.col.description")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>voice_input</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;text, timestamp&#125;</code></td>
            <td>{t("spectacles.voiceInterface.broadcastEvents.voiceInput.desc")}</td>
          </tr>
          <tr>
            <td><code>voice_response</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;text, timestamp&#125;</code></td>
            <td>{t("spectacles.voiceInterface.broadcastEvents.voiceResponse.desc")}</td>
          </tr>
          <tr>
            <td><code>voice_inject</code></td>
            <td>glasses -&gt; web</td>
            <td><code>&#123;message, priority, timestamp&#125;</code></td>
            <td>{t("spectacles.voiceInterface.broadcastEvents.voiceInject.desc")}</td>
          </tr>
        </tbody>
      </table>

      <h3>{t("spectacles.voiceInterface.testingWithout.heading")}</h3>
      <p>{t("spectacles.voiceInterface.testingWithout.text")}</p>
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

      <h2>{t("spectacles.markerTracking.heading")}</h2>
      <p>{t("spectacles.markerTracking.text")}</p>

      <h3>{t("spectacles.markerTracking.defaultMode.heading")}</h3>
      <ol>
        <li>{t("spectacles.markerTracking.defaultMode.step1")}</li>
        <li>{t("spectacles.markerTracking.defaultMode.step2")}</li>
        <li>{t("spectacles.markerTracking.defaultMode.step3")}</li>
        <li>{t("spectacles.markerTracking.defaultMode.step4")}</li>
      </ol>

      <h3>{t("spectacles.markerTracking.markerMode.heading")}</h3>
      <ol>
        <li>{t("spectacles.markerTracking.markerMode.step1")}</li>
        <li>{t("spectacles.markerTracking.markerMode.step2")}</li>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.markerTracking.markerMode.step3") }} />
      </ol>

      <h3>{t("spectacles.markerTracking.sceneHierarchy.heading")}</h3>
      <pre className="docs-code"><code>{`Extended_Marker_Tracking (root)
  Object 1 [MarkerTrackingComponent]
    RealtimePanel [TilePanel]   <- auto-places after 3s or on marker detection`}</code></pre>

      <h2>{t("spectacles.troubleshooting.heading")}</h2>

      <h3>{t("spectacles.troubleshooting.snapCloud.heading")}</h3>
      <p>{t("spectacles.troubleshooting.snapCloud.text")}</p>

      <h3>{t("spectacles.troubleshooting.noEvents.heading")}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.troubleshooting.noEvents.item1") }} />
        <li>{t("spectacles.troubleshooting.noEvents.item2")}</li>
        <li>{t("spectacles.troubleshooting.noEvents.item3")}</li>
      </ul>

      <h3>{t("spectacles.troubleshooting.noTiles.heading")}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.troubleshooting.noTiles.item1") }} />
        <li>{t("spectacles.troubleshooting.noTiles.item2")}</li>
        <li>{t("spectacles.troubleshooting.noTiles.item3")}</li>
      </ul>

      <h3>{t("spectacles.troubleshooting.texturesDecode.heading")}</h3>
      <ul>
        <li>{t("spectacles.troubleshooting.texturesDecode.item1")}</li>
        <li>{t("spectacles.troubleshooting.texturesDecode.item2")}</li>
      </ul>

      <h3>{t("spectacles.troubleshooting.wrongSize.heading")}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("spectacles.troubleshooting.wrongSize.item1") }} />
        <li>{t("spectacles.troubleshooting.wrongSize.item2")}</li>
        <li>{t("spectacles.troubleshooting.wrongSize.item3")}</li>
      </ul>

      <h2>{t("spectacles.ergonomics.heading")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("spectacles.ergonomics.col.parameter")}</th>
            <th>{t("spectacles.ergonomics.col.value")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("spectacles.ergonomics.comfortDistance")}</td>
            <td>65 cm</td>
          </tr>
          <tr>
            <td>{t("spectacles.ergonomics.comfortRectangle")}</td>
            <td>~47 x 28 cm</td>
          </tr>
          <tr>
            <td>{t("spectacles.ergonomics.defaultTile")}</td>
            <td>14 cm with 1.5 cm gap</td>
          </tr>
          <tr>
            <td>{t("spectacles.ergonomics.bodyTextMin")}</td>
            <td>0.5 cm height</td>
          </tr>
          <tr>
            <td>{t("spectacles.ergonomics.tapTargetMin")}</td>
            <td>2.0 x 2.0 cm</td>
          </tr>
        </tbody>
      </table>

      <h2>{t("spectacles.dependencies.heading")}</h2>
      <ul>
        <li>{t("spectacles.dependencies.lensStudio")}</li>
        <li>{t("spectacles.dependencies.interactionKit")}</li>
        <li>{t("spectacles.dependencies.supabaseClient")}</li>
        <li>{t("spectacles.dependencies.supabaseProject")}</li>
      </ul>
    </article>
  );
}
