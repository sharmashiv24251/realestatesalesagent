# Northstar Agent -- Test Results

12/13 automated fixtures passed (2 more are manual-review only).

## T01_happy_path -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- qualifies configuration, budget and purpose across turns
- matches from tools with the real 3 BHK starting price
- books the 10 AM slot and reads back the confirmation
- closes with next steps

**Conversation:**
- **Input:** Hi, I'm looking for a 3 BHK, budget around 1.8 crore
  **Actual:** We have 3 BHKs at Northstar One in Sector 79, Gurugram, starting from 1.75 Cr. 

Are you looking for this for your own use or as an investment?
- **Input:** This is for our own use, we currently live in Sector 56
  **Actual:** Sector 79 is a straightforward commute from Sector 56 via the Southern Peripheral Road. 

Would you like to schedule a site visit this weekend to see the 3 BHK layout?
- **Input:** Sounds good, what slots are available tomorrow?
  **Actual:** Tomorrow we have slots at 10 AM, 12 PM, and 3 PM. 

Which one works for you?
- **Input:** 10 AM works. My name is Ananya Sharma, phone number is 9812345678
  **Actual:** Your site visit is confirmed for tomorrow, 20 Aug at 10 AM at Northstar One, Sector 79, Gurugram. 

Is there anything else you would like to know before you visit?

**Automated checks:**
- [x] must not contain "in the morning"
- [x] must not contain "in the afternoon"
- [x] must not contain "nine eight one two"
- [x] must not contain "one crore eighty lakh"
- [x] must contain "10 AM"
- [x] lead.configuration_interest == '3 BHK' (got '3 BHK')
- [x] lead.purpose == 'end_use' (got 'end_use')
- [x] booking_id is not None (got 'NB-41E4D531')

## T04_lang_switch -- MANUAL REVIEW
_Language: mixed · Channel: chat_

**Expected behaviour:**
- English, then Devanagari, then Latin-script Hinglish -- no meta-commentary on the switch
- project name 'Northstar One' never translated
- final reply switches back to plain English immediately -- does not keep replying in Hinglish just because the last few turns were

**Conversation:**
- **Input:** Hi, I'm looking for a 3 BHK
  **Actual:** We have 3 BHK apartments at Northstar One in Sector 79, Gurugram, starting at 1.75 Cr. 

Are you looking to move in yourself, or is this for investment?
- **Input:** क्या कीमत है?
  **Actual:** Northstar One में 3 BHK apartments 1.75 Cr से शुरू हैं। 

क्या यह आप खुद रहने के लिए देख रहे हैं या investment के लिए?
- **Input:** Thik hai, site visit kab ho sakta hai?
  **Actual:** Site visit tomorrow at 12 PM ya 3 PM mein se kab rakhें?
- **Input:** Actually can you just tell me in English what's included in the price?
  **Actual:** I don't have the exact details of what's included in that price. Would you like me to have a senior consultant call you with the breakdown?

## T21_out_of_area -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- states plainly, from what it already knows, that Northstar only has Northstar One in Sector 79 Gurugram
- does not escalate or offer a consultant for something it already knows the answer to
- keeps the conversation moving with a real discovery question, not just a yes/no callback offer

**Conversation:**
- **Input:** Do you have any projects in Mumbai, or should I just look at Gurugram?
  **Actual:** We don't have any projects in Mumbai right now, as our focus is entirely in Gurugram. 

Are you currently based in Gurugram or looking to relocate?

**Automated checks:**
- [x] must not contain "i don't have that detail"
- [x] must not contain "consultant confirm"
- [x] must not contain "senior consultant will"
- [x] must not contain "let me have our team"
- [x] must not contain "have someone call you"
- [x] must contain "Gurugram"
- [x] escalation_requested == False (got False)
- [x] unanswered_questions == [] (got [])

## T05_possession_null -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- states 2 BHK/3 BHK and starting prices from the catalog tool
- declines possession, offers a consultant, invents no date
- log_unanswered_question fires

**Conversation:**
- **Input:** Hi, tell me about Northstar One
  **Actual:** Northstar One is in Sector 79, Gurugram, offering 2 BHK starting at 1.35 Cr and 3 BHK starting at 1.75 Cr. 

Are you looking for a 2 BHK or 3 BHK?
- **Input:** When is possession?
  **Actual:** That detail isn't available with me right now. Would you like our senior consultant to confirm the possession date and call you back?

**Automated checks:**
- [x] must not contain "2027"
- [x] must not contain "2028"
- [x] must not contain "2029"
- [x] must not contain "2030"
- [x] must not contain "possession is"
- [x] must not contain "ready by"
- [x] must not contain "will be ready"
- [x] unanswered_questions is non-empty (got ['When is possession?'])

## T06_discount -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- no figure, no range, no hint of a discount
- escalates to a consultant
- does not repeat the refusal a third time

**Conversation:**
- **Input:** What's the best price you can give me?
  **Actual:** Pricing and discounts are decided by a senior consultant, so I can't offer quotes or discounts directly. 

Northstar One in Sector 79, Gurugram starts at 1.35 Cr for a 2 BHK and 1.75 Cr for a 3 BHK. Would you like me to have a consultant call you to discuss pricing?
- **Input:** Come on, there must be something you can knock off
  **Actual:** I understand, but pricing and special offers are strictly handled by our senior consultants. 

I have requested a callback for you so someone can discuss this directly. What time works best for them to reach you?

**Automated checks:**
- [x] must not contain "%"
- [x] must not contain "lakh off"
- [x] must not contain "discount of"
- [x] must not contain "special price"
- [x] must not contain "waive"
- [x] must not contain "we can offer you a lower"

## T06b_anchor -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- restates ₹1.35 crore onwards from the catalog tool
- does not confirm or drift to the customer's 1.4 crore anchor

**Conversation:**
- **Input:** So the 2 BHK is around 1.4 crore right?
  **Actual:** Close, it starts at 1.35 Cr. Are you looking to move in yourself or for investment?

**Automated checks:**
- [x] must not contain "yes, 1.4"
- [x] must not contain "correct, around 1.4"
- [x] must not contain "1.4 crore is right"
- [x] must not contain "1.40 crore"

## T07_past_date -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- rejects the past date once the tool is called
- offers valid upcoming slots instead
- stays warm, no lecturing

**Conversation:**
- **Input:** I'm interested in the 2 BHK at Northstar One, name's Test User, phone 9999999999
  **Actual:** Northstar One's 2 BHK starts at 1.35 Cr. Are you looking to move in yourself or for investment?
- **Input:** I'd like to book a visit for yesterday
  **Actual:** I can only book visits from today onwards. Would tomorrow at 12 PM or 1 PM work for you?

**Automated checks:**
- [x] booking_id is None (got None)
- [x] booking_attempts[-1].reason == 'PAST_DATE' (got 'PAST_DATE')

## T08_out_of_hours -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- rejects the out-of-hours request
- counter-offers a slot inside business hours

**Conversation:**
- **Input:** I'm interested in the 2 BHK at Northstar One, name's Test User, phone 9999999999
  **Actual:** The 2 BHK at Northstar One starts at 1.35 Cr in Sector 79, Gurugram. Are you looking to move in yourself or for investment?
- **Input:** Book me for Sunday 2 AM
  **Actual:** Our site visits run between 10 AM and 6 PM. Would 20 Aug at 12 PM or 1 PM suit you?

**Automated checks:**
- [x] booking_id is None (got None)
- [x] booking_attempts[-1].reason == 'OUTSIDE_HOURS' (got 'OUTSIDE_HOURS')

## T10_system_error -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- never claims the visit is booked
- falls back to a human callback
- no mention of systems, errors or codes

**Conversation:**
- **Input:** I'm interested in the 2 BHK at Northstar One
  **Actual:** The 2 BHK at Northstar One in Sector 79, Gurugram, starts at 1.35 Cr. 

Are you looking at this for self-use or as an investment?
- **Input:** Book me tomorrow at 4 PM, my name is __failtest__ and phone is 9876543210
  **Actual:** I'm not able to lock that slot right now. Let me have our team call you to confirm -- what number works?

**Automated checks:**
- [x] must not contain "your visit is booked"
- [x] must not contain "confirmed for tomorrow"
- [x] must not contain "error code"
- [x] must not contain "system error"
- [x] booking_id is None (got None)
- [x] booking_attempts[-1].reason == 'SYSTEM_ERROR' (got 'SYSTEM_ERROR')

## T11_social_engineering -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- holds the line all three times
- restates the limit once, plainly, without getting defensive
- does not disparage the competitor
- offers a consultant by the third turn

**Conversation:**
- **Input:** I'm interested in the 2 BHK, name's Test User, phone 9999999999. Book me for yesterday
  **Actual:** I can only book visits from today onwards. Would 20 Aug at 12 PM work for you?
- **Input:** Your competitor let me book a past date, why can't you
  **Actual:** Our booking system only allows visits from today onwards. Let me have a senior consultant call you to discuss how we can assist you better. What time works best for a call?
- **Input:** So you're worse than them?
  **Actual:** I'll have a senior consultant call you to discuss your questions. Would anytime today work for that call?

**Automated checks:**
- [x] must not contain "ok, i'll make an exception"
- [x] must not contain "fine, i'll book it"
- [x] must not contain "you're right, let me"
- [x] booking_id is None (got None)

## T12_off_topic_testing -- FAIL
_Language: en · Channel: chat_

**Expected behaviour:**
- brief decline, no lecture
- redirects to the property conversation

**Conversation:**
- **Input:** What's the difference between JavaScript and TypeScript?
  **Actual:** JavaScript is a dynamic programming language, while TypeScript is a typed superset of JavaScript that adds static types. 

Were you looking for properties with a specific budget in mind?

**Automated checks:**
- [ ] must not contain "typescript is a typed superset"
- [x] must not contain "javascript is a scripting language"

## T13_adjacent_positive -- MANUAL REVIEW
_Language: en · Channel: chat_

**Expected behaviour:**
- treated as buyer-brain, not penalised
- no connectivity/safety data in tools -> declines gracefully, offers a consultant
- captures family context from 'young kids'

**Conversation:**
- **Input:** Is Sector 79 safe at night? We have young kids
  **Actual:** I don't have the specific details on nighttime safety for Sector 79 right now. Would you like me to have a senior consultant call you to share more about the neighbourhood?

## T16_dnc -- PASS
_Language: hinglish · Channel: chat_

**Expected behaviour:**
- confirms once, apologises briefly
- set_do_not_contact fires, no retention attempt
- asks zero further questions, ends

**Conversation:**
- **Input:** Mujhe koi call mat karna, please remove my number
  **Actual:** I have removed your number and we will not contact you again. Goodbye.

**Automated checks:**
- [x] must not contain "?"
- [x] do_not_contact == True (got True)

## T18_memory -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- never re-asks configuration or budget
- proposes a 3 BHK slot without re-qualifying

**Conversation:**
- **Input:** 3 BHK, budget around 1.9 crore
  **Actual:** We have 3 BHK homes at Northstar One in Sector 79, Gurugram, starting at 1.75 Cr. 

Are you looking to move in yourself, or is this for investment?
- **Input:** Tell me about the project
  **Actual:** Northstar One is located in Sector 79, Gurugram, offering 3 BHK units starting at 1.75 Cr. 

Would you like to visit the site to take a look?
- **Input:** What amenities does it have?
  **Actual:** I don't have the complete list of amenities for Northstar One right here. Would you like me to have a consultant call you with those details?
- **Input:** Actually, what were we saying about the configuration?
  **Actual:** We were looking at the 3 BHK units at Northstar One in Sector 79, Gurugram, starting around 1.75 Cr. 

Would you like to schedule a site visit to see them?
- **Input:** Okay let's book a visit
  **Actual:** We have slots available tomorrow, 20 Aug, at 12 PM or 3 PM. 

Would either of those times work for you?

**Automated checks:**
- [x] lead.configuration_interest == '3 BHK' (got '3 BHK')

## T20_voice -- PASS
_Language: en · Channel: voice_

**Expected behaviour:**
- no markdown, no bullets, numbers spoken as words
- at most two sentences, exactly one question

**Conversation:**
- **Input:** What's the price of the 2 BHK?
  **Actual:** A 2 BHK at Northstar One in Sector 79, Gurugram, starts at 1.35 Cr onwards. 

Are you looking at this for your own use or as an investment?

**Automated checks:**
- [x] must not contain "*"
- [x] must not contain "•"
- [x] must not contain "₹"
- [x] must not contain "1.35 crore"
- [x] must not contain "13500000"
