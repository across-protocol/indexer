# OftTransferAggregator End-to-End Test Plan

## Overview

This document outlines the test plan for the `OftTransferAggregator` class, which is responsible for aggregating OFT (Omnichain Fungible Token) events into unified OFT transfers.

## Test Cases

### 1. New OFTSent Event Processing

#### 1.1 Single OFTSent Event → New OFT Transfer Created

- **Given**: An empty database
- **When**: A new OFTSent event is added
- **Then**:
  - A new OftTransfer row is created
  - `guid` matches the sent event's GUID
  - `oftSentEventId` is set to the sent event's ID
  - `status` is `"unfilled"`

#### 1.2 Multiple OFTSent Events with Different GUIDs

- **Given**: An empty database
- **When**: Multiple OFTSent events with different GUIDs are added
- **Then**:
  - Each event creates a separate OftTransfer row (3 transfers for 3 events)
  - All rows have `status` = `"unfilled"`
  - All rows have `oftSentEventId` set

#### 1.3 OFTSent Event with Existing GUID (Different Event ID)

- **Given**: An existing OftTransfer with a specific GUID linked to OFTSent event A
- **When**: A new OFTSent event B with the same GUID but different event ID is added
- **Then**:
  - Only one OftTransfer row exists (no duplicates)
  - `guid` remains the same
  - `oftSentEventId` is updated to event B's ID

#### 1.4 OFTSent Event with Existing GUID (Same Event ID)

- **Given**: An existing OftTransfer linked to OFTSent event A
- **When**: The same OFTSent event A is processed again
- **Then**:
  - No update occurs (no-op)
  - Database remains unchanged

---

### 2. New OFTReceived Event Processing

#### 2.1 Single OFTReceived Event → New OFT Transfer Created

- **Given**: An empty database
- **When**: A new OFTReceived event is added
- **Then**:
  - A new OftTransfer row is created
  - `guid` matches the received event's GUID
  - `oftReceivedEventId` is set to the received event's ID
  - `status` is `"filled"`

#### 2.2 Multiple OFTReceived Events with Different GUIDs

- **Given**: An empty database
- **When**: Multiple OFTReceived events with different GUIDs are added
- **Then**:
  - Each event creates a separate OftTransfer row (3 transfers for 3 events)
  - All rows have `status` = `"filled"`
  - All rows have `oftReceivedEventId` set

#### 2.3 OFTReceived Event with Existing GUID (Different Event ID)

- **Given**: An existing OftTransfer with a specific GUID linked to OFTReceived event A
- **When**: A new OFTReceived event B with the same GUID but different event ID is added
- **Then**:
  - Only one OftTransfer row exists (no duplicates)
  - `guid` remains the same
  - `oftReceivedEventId` is updated to event B's ID

#### 2.4 OFTReceived Event with Existing GUID (Same Event ID)

- **Given**: An existing OftTransfer linked to OFTReceived event A
- **When**: The same OFTReceived event A is processed again
- **Then**:
  - No update occurs (no-op)
  - Database remains unchanged

---

### 3. Matching Sent and Received Events

#### 3.1 OFTSent First, Then OFTReceived (Complete Transfer)

- **Given**: An OftTransfer exists with only OFTSent event (status = `"unfilled"`)
- **When**: An OFTReceived event with the same GUID is added
- **Then**:
  - Only one OftTransfer row exists (no duplicates)
  - `guid` matches both events
  - Both `oftSentEventId` and `oftReceivedEventId` are set
  - `status` is updated to `"filled"`

#### 3.2 OFTReceived First, Then OFTSent (Complete Transfer)

- **Given**: An OftTransfer exists with only OFTReceived event (status = `"filled"`)
- **When**: An OFTSent event with the same GUID is added
- **Then**:
  - Only one OftTransfer row exists (no duplicates)
  - `guid` matches both events
  - Both `oftSentEventId` and `oftReceivedEventId` are set
  - `status` remains `"filled"`

#### 3.3 Both Events Processed Simultaneously

- **Given**: An empty database
- **When**: Both OFTSent and OFTReceived events with the same GUID are added in the same call
- **Then**:
  - Only one OftTransfer row exists (no duplicates)
  - `guid` matches both events
  - Both `oftSentEventId` and `oftReceivedEventId` are set
  - `status` is `"filled"`

---

### 4. Deleted/Re-Organized OFTSent Events

#### 4.1 Deleted OFTSent Event (Transfer Has No OFTReceived)

- **Given**: An OftTransfer with only OFTSent event (no received event)
- **When**: The OFTSent event is marked as deleted (deletedAt set) and processed
- **Then**:
  - The entire OftTransfer row is deleted
  - No transfers remain in database

#### 4.2 Deleted OFTSent Event (Transfer Has OFTReceived)

- **Given**: An OftTransfer with both OFTSent and OFTReceived events (status = `"filled"`)
- **When**: The OFTSent event is marked as deleted (deletedAt set) and processed
- **Then**:
  - The OftTransfer row is updated (not deleted)
  - Only one transfer remains
  - `guid` remains the same
  - `oftSentEventId` is set to null
  - `oftReceivedEventId` remains set to the received event's ID
  - `originTxnRef` is set to null
  - `status` remains `"filled"`

#### 4.3 Multiple Deleted OFTSent Events

- **Given**: Multiple OftTransfers with only OFTSent events (3 transfers)
- **When**: Multiple OFTSent events are marked as deleted and processed
- **Then**:
  - All transfers are deleted
  - No transfers remain in database

---

### 5. Deleted/Re-Organized OFTReceived Events

#### 5.1 Deleted OFTReceived Event (Transfer Has No OFTSent)

- **Given**: An OftTransfer with only OFTReceived event (no sent event)
- **When**: The OFTReceived event is marked as deleted (deletedAt set) and processed
- **Then**:
  - The entire OftTransfer row is deleted
  - No transfers remain in database

#### 5.2 Deleted OFTReceived Event (Transfer Has OFTSent)

- **Given**: An OftTransfer with both OFTSent and OFTReceived events (status = `"filled"`)
- **When**: The OFTReceived event is marked as deleted (deletedAt set) and processed
- **Then**:
  - The OftTransfer row is updated (not deleted)
  - Only one transfer remains
  - `guid` remains the same
  - `oftSentEventId` remains set to the sent event's ID
  - `oftReceivedEventId` is set to null
  - `destinationTxnRef` is set to null
  - `status` is updated to `"unfilled"`

#### 5.3 Multiple Deleted OFTReceived Events

- **Given**: Multiple OftTransfers with only OFTReceived events (3 transfers)
- **When**: Multiple OFTReceived events are marked as deleted and processed
- **Then**:
  - All transfers are deleted
  - No transfers remain in database

---

### 6. Complex Re-Organization Scenarios

#### 6.1 Sequential Re-Org: Delete Then Re-Add

- **Given**: A complete OftTransfer (both sent and received events)
- **When**:
  1. OFTSent event is marked as deleted and processed
  2. A new OFTSent event with the same GUID is added
- **Then**:
  - Only one OftTransfer row exists throughout
  - After re-add: `oftSentEventId` is set to the new event's ID
  - Both `oftSentEventId` and `oftReceivedEventId` are set
  - `status` is `"filled"`

#### 6.2 Both Events Deleted Sequentially

- **Given**: A complete OftTransfer (both sent and received events)
- **When**:
  1. OFTSent event is marked as deleted and processed
  2. OFTReceived event is marked as deleted and processed
- **Then**:
  - After first deletion: One transfer exists (with only received event)
  - After second deletion: Transfer is completely deleted
  - No transfers remain in database

#### 6.3 Both Events Deleted Simultaneously

- **Given**: A complete OftTransfer (both sent and received events)
- **When**: Both OFTSent and OFTReceived events are marked as deleted and processed in the same call
- **Then**:
  - The OftTransfer row is deleted
  - No transfers remain in database

---

### 7. Edge Cases and Error Handling

#### 7.1 Empty Input Arrays

- **Given**: Database in any state
- **When**: `processDatabaseEvents()` is called with all empty arrays
- **Then**:
  - No errors occur
  - Database state remains unchanged
  - Method completes successfully

---
