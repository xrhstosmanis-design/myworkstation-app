import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteTrialGate} from '../src/lib/remote-agent-trial.js';
const now=1700000000000;
const env={REMOTE_AGENT_ENABLED:'true',REMOTE_AGENT_TRIAL_TERMINAL_ID:'laptop',REMOTE_AGENT_TRIAL_UNTIL:new Date(now+20*60000).toISOString()};
test('global flag alone never opens remote access',()=>{assert.equal(createRemoteTrialGate({REMOTE_AGENT_ENABLED:'true'},now).enabled(now),false);});
test('trial admits only named terminal and expires automatically',()=>{const gate=createRemoteTrialGate(env,now);assert.equal(gate.enabled(now),true);assert.equal(gate.acceptsTerminal('laptop',now),true);assert.equal(gate.acceptsTerminal('other',now),false);assert.equal(gate.enabled(now+20*60000),false);assert.equal(gate.acceptsTerminal('laptop',now+20*60000),false);});
test('invalid, disabled, expired or overlong trial fails closed',()=>{for(const change of [{REMOTE_AGENT_ENABLED:'false'},{REMOTE_AGENT_TRIAL_TERMINAL_ID:''},{REMOTE_AGENT_TRIAL_UNTIL:'bad'},{REMOTE_AGENT_TRIAL_UNTIL:new Date(now).toISOString()},{REMOTE_AGENT_TRIAL_UNTIL:new Date(now+31*60000).toISOString()}])assert.equal(createRemoteTrialGate({...env,...change},now).enabled(now),false);});
