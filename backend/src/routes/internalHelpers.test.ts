import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveRequestStatusFromRemaining, isAuthorizedInternalCallback } from './internalHelpers'

test('isAuthorizedInternalCallback rejects missing configured key', () => {
  assert.equal(isAuthorizedInternalCallback('', 'abc'), false)
})

test('isAuthorizedInternalCallback rejects mismatched key', () => {
  assert.equal(isAuthorizedInternalCallback('expected', 'provided'), false)
})

test('isAuthorizedInternalCallback accepts exact key match', () => {
  assert.equal(isAuthorizedInternalCallback('expected', 'expected'), true)
})

test('deriveRequestStatusFromRemaining returns completed when no remaining agents', () => {
  assert.equal(deriveRequestStatusFromRemaining(0), 'completed')
})

test('deriveRequestStatusFromRemaining returns running when work remains', () => {
  assert.equal(deriveRequestStatusFromRemaining(2), 'running')
})

