// Paste these into the browser console at /r/demo/spectacles
// Step 1: Connect to channel
const {supabase} = await import('/src/lib/supabase.ts')
const ch = supabase.channel('spectacles:demo:editor', {config:{broadcast:{self:true}}})
ch.subscribe(s => console.log('channel:', s))

// Step 2: Wait for "SUBSCRIBED" in console, then run these one at a time:

// Simulate user speaking
ch.send({type:'broadcast', event:'voice_input', payload:{text:'What are agents working on?', timestamp:Date.now()}})

// Simulate Gemini responding
ch.send({type:'broadcast', event:'voice_response', payload:{text:'12 agents active, mostly on demo polish.', timestamp:Date.now()}})

// Simulate voice injection to room
ch.send({type:'broadcast', event:'voice_inject', payload:{message:'Focus on the Spectacles milestone', timestamp:Date.now()}})
