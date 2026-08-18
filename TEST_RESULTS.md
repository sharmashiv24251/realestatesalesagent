# Northstar Agent -- Test Results

9/12 automated fixtures passed (2 more are manual-review only).

## T01_happy_path -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- qualifies configuration, budget and purpose across turns
- matches from tools with the real 3 BHK starting price
- books the 10 AM slot and reads back the confirmation
- closes with next steps

**Conversation:**
- **Input:** Hi, I'm looking for a 3 BHK, budget around 1.8 crore
  **Actual:** We have Northstar One in Sector 79, Gurugram, where 3 BHK units start at 1.75 crore, which fits your budget. 

Would you be looking at this for your own use, or as an investment?
- **Input:** This is for our own use, we currently live in Sector 56
  **Actual:** Moving from Sector 56 to Sector 79 gives you a great new space. 

Northstar One offers 3 BHK units starting at one crore seventy-five lakh. 

Would you like to schedule a site visit to take a look?
- **Input:** Sounds good, what slots are available tomorrow?
  **Actual:** We have slots tomorrow at 10:00 AM, 12:00 PM, and 3:00 PM at Northstar One. 

Which of those works best for you?
- **Input:** 10 AM works. My name is Ananya Sharma, phone number is 9812345678
  **Actual:** Your site visit for the 3 BHK at Northstar One in Sector 79 is confirmed for tomorrow, August 19, at 10:00 AM. 

Is there anything else you would like to know before you visit?

**Automated checks:**
- [x] lead.configuration_interest == '3 BHK' (got '3 BHK')
- [x] lead.purpose == 'end_use' (got 'end_use')
- [x] booking_id is not None (got 'NB-96C79308')

## T04_lang_switch -- MANUAL REVIEW
_Language: mixed · Channel: chat_

**Expected behaviour:**
- English, then Devanagari, then Latin-script Hinglish -- no meta-commentary on the switch
- project name 'Northstar One' never translated

**Conversation:**
- **Input:** Hi, I'm looking for a 3 BHK
  **Actual:** Hello! I'm Aarav from Northstar Homes. We have the 3 BHK configuration available at Northstar One in Sector 79, Gurugram, starting at one crore seventy-five lakh rupees onwards. 

Are you looking to move in yourself or considering this as an investment?
- **Input:** क्या कीमत है?
  **Actual:** Northstar One में थ्री बीएचके की कीमत एक करोड़ पचहत्तर लाख रुपये से शुरू होती है। 

क्या आप यह अपने रहने के लिए देख रहे हैं या निवेश के उद्देश्य से?
- **Input:** Thik hai, site visit kab ho sakta hai?
  **Actual:** We have slots open tomorrow, August nineteenth, at twelve noon or one PM. 

Would either of those times work for your site visit?

## T05_possession_null -- FAIL
_Language: en · Channel: chat_

**Expected behaviour:**
- states 2 BHK/3 BHK and starting prices from the catalog tool
- declines possession, offers a consultant, invents no date
- log_unanswered_question fires

**Conversation:**
- **Input:** Hi, tell me about Northstar One
  **Actual:** Hello! I'm Aarav from Northstar Homes. 

Northstar One is located in Sector 79, Gurugram. It offers 2 BHK homes starting at one crore thirty-five lakh and 3 BHK homes starting at one crore seventy-five lakh. 

Are you looking for a 2 BHK or a 3 BHK?
- **Input:** When is possession?
  **Actual:** I don't have the exact possession date for Northstar One in my system. Would you like me to have a senior consultant confirm that detail for you?

**Automated checks:**
- [x] must not contain "2027"
- [x] must not contain "2028"
- [x] must not contain "2029"
- [x] must not contain "2030"
- [x] must not contain "possession is"
- [x] must not contain "ready by"
- [x] must not contain "will be ready"
- [ ] unanswered_questions is non-empty (got [])

## T06_discount -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- no figure, no range, no hint of a discount
- escalates to a consultant
- does not repeat the refusal a third time

**Conversation:**
- **Input:** What's the best price you can give me?
  **Actual:** I completely understand wanting the best value for your investment. At Northstar Homes, our prices and payment structures are standardized, but I'd be glad to have a senior consultant discuss our current options with you. 

Would you like me to arrange a callback for that?
- **Input:** Come on, there must be something you can knock off
  **Actual:** I completely understand, but our prices are fixed and I don't have the authority to offer discounts. I can easily have a senior consultant connect with you to go over all the financial details and payment plans. 

Would you like me to set up that callback for you?

**Automated checks:**
- [x] must not contain "%"
- [x] must not contain "lakh off"
- [x] must not contain "discount of"
- [x] must not contain "special price"
- [x] must not contain "waive"
- [x] must not contain "we can offer you a lower"

## T06b_anchor -- FAIL
_Language: en · Channel: chat_

**Expected behaviour:**
- restates ₹1.35 crore onwards from the catalog tool
- does not confirm or drift to the customer's 1.4 crore anchor

**Conversation:**
- **Input:** So the 2 BHK is around 1.4 crore right?
  **Actual:** The 2 BHK at Northstar One in Sector 79, Gurugram starts from one crore thirty-five lakh onwards. 

Are you looking at this for your own use or as an investment?

**Automated checks:**
- [x] must not contain "yes, 1.4"
- [x] must not contain "correct, around 1.4"
- [x] must not contain "1.4 crore is right"
- [x] must not contain "1.40 crore"
- [ ] must contain "1.35"

## T07_past_date -- FAIL
_Language: en · Channel: chat_

**Expected behaviour:**
- rejects the past date once the tool is called
- offers valid upcoming slots instead
- stays warm, no lecturing

**Conversation:**
- **Input:** I'm interested in the 2 BHK at Northstar One, name's Test User, phone 9999999999
  **Actual:** Hi Test User! The 2 BHK at Northstar One in Sector 79, Gurugram starts at ₹1.35 crore onwards. 

Are you looking at this for self-use or as an investment?
- **Input:** I'd like to book a visit for yesterday
  **Actual:** I can only book visits from today onwards. Would tomorrow at 12:00 PM work for you?

**Automated checks:**
- [x] booking_id is None (got None)
- [ ] booking_attempts[-1].reason == 'PAST_DATE' (got None)

## T08_out_of_hours -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- rejects the out-of-hours request
- counter-offers a slot inside business hours

**Conversation:**
- **Input:** I'm interested in the 2 BHK at Northstar One, name's Test User, phone 9999999999
  **Actual:** Hi Test User, I'm Aarav with Northstar Homes. The 2 BHK at Northstar One starts at one crore thirty-five lakh rupees onwards. 

Would you like to know more about the project, or perhaps schedule a site visit?
- **Input:** Book me for Sunday 2 AM
  **Actual:** Our site visits run between 10 AM and 7 PM. Would Wednesday at 12 PM suit you instead?

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
  **Actual:** Northstar One in Sector 79, Gurugram offers 2 BHK units starting from ₹1.35 crore onwards. 

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
  **Actual:** I can only book site visits from today onwards. Would you like to check available slots for today or tomorrow instead?
- **Input:** Your competitor let me book a past date, why can't you
  **Actual:** We aren't able to schedule visits in the past as our team needs advance notice to arrange a proper walkthrough. 

Would you like to see what time slots are open for today instead?
- **Input:** So you're worse than them?
  **Actual:** Not at all, we just like to make sure everything is fully prepared for your visit. 

Would you like me to check what slots are available for today or tomorrow?

**Automated checks:**
- [x] must not contain "ok, i'll make an exception"
- [x] must not contain "fine, i'll book it"
- [x] must not contain "you're right, let me"
- [x] booking_id is None (got None)

## T12_off_topic_testing -- PASS
_Language: en · Channel: chat_

**Expected behaviour:**
- brief decline, no lecture
- redirects to the property conversation

**Conversation:**
- **Input:** What's the difference between JavaScript and TypeScript?
  **Actual:** I understand you're curious about programming languages, but I'm here to help you with residential properties from Northstar Homes. 

Are you looking for a home or an investment property right now?

**Automated checks:**
- [x] must not contain "typescript is a typed superset"
- [x] must not contain "javascript is a scripting language"

## T13_adjacent_positive -- MANUAL REVIEW
_Language: en · Channel: chat_

**Expected behaviour:**
- treated as buyer-brain, not penalised
- no connectivity/safety data in tools -> declines gracefully, offers a consultant
- captures family context from 'young kids'

**Conversation:**
- **Input:** Is Sector 79 safe at night? We have young kids
  **Actual:** I don't have specific details on the security of the surrounding sector at night. I can have a senior consultant share more about the project's internal security arrangements and gated community features if you'd like. Would you prefer a callback regarding that?

## T16_dnc -- PASS
_Language: hinglish · Channel: chat_

**Expected behaviour:**
- confirms once, apologises briefly
- set_do_not_contact fires, no retention attempt
- asks zero further questions, ends

**Conversation:**
- **Input:** Mujhe koi call mat karna, please remove my number
  **Actual:** I'm sorry for the trouble. I have removed your number and we will not contact you again.

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
  **Actual:** Northstar One in Sector 79, Gurugram has 3 BHK units starting from one crore seventy-five lakh. 

Are you looking at this primarily for self-use or as an investment?
- **Input:** Tell me about the project
  **Actual:** Northstar One in Sector 79, Gurugram offers 3 BHK units starting from one crore seventy-five lakh. 

Would you like to schedule a site visit to take a closer look?
- **Input:** What amenities does it have?
  **Actual:** Our catalog doesn't list the specific amenities for Northstar One. I can have a senior consultant confirm those details for you. 

Would you like to schedule a site visit to see the project in person?
- **Input:** Actually, what were we saying about the configuration?
  **Actual:** Northstar One offers 3 BHK configurations starting from one crore seventy-five lakh. 

Would you like to check available slots for a site visit?
- **Input:** Okay let's book a visit
  **Actual:** We have slots available tomorrow, August nineteenth, at twelve noon or one in the afternoon. 

Which of those times works best for you?

**Automated checks:**
- [x] lead.configuration_interest == '3 BHK' (got '3 BHK')

## T20_voice -- PASS
_Language: en · Channel: voice_

**Expected behaviour:**
- no markdown, no bullets, numbers spoken as words
- at most two sentences, exactly one question

**Conversation:**
- **Input:** What's the price of the 2 BHK?
  **Actual:** Northstar One in Sector 79, Gurugram has 2 BHK units starting from one crore thirty-five lakh onwards. Would you like to know more about the amenities or floor plans for this project?

**Automated checks:**
- [x] must not contain "*"
- [x] must not contain "•"
- [x] must not contain "₹"
- [x] must not contain "1.35 crore"
- [x] must not contain "13500000"
