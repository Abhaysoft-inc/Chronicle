"""
Generate realistic Indian medical records (Prescriptions, Operation Records, Consent Forms,
Doctor Admission Notes, Nursing Vitals Charts/MAR, Discharge Summaries, and Care Deviation Test Cases)
as high-resolution PDFs and PNGs for testing Chronicle's document processing, OCR, extraction,
verification, and rule-finding pipeline.
"""

import os
import fitz

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, "samples", "clinical-test-suite")
FONTS_DIR = "C:/Windows/Fonts"
arch = fitz.Archive(FONTS_DIR)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Common CSS for authentic hospital stationery
BASE_CSS = """
@font-face { font-family: 'Nirmala'; src: url(Nirmala.ttc); }
@font-face { font-family: 'Arial'; src: url(arial.ttf); }

* { box-sizing: border-box; }
body {
    font-family: 'Nirmala', 'Arial', sans-serif;
    font-size: 8.4pt;
    line-height: 1.28;
    color: #1e293b;
    margin: 0;
    padding: 0;
}

.hospital-header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 5px;
    margin-bottom: 7px;
}
.hospital-title {
    font-size: 14pt;
    font-weight: bold;
    color: #0369a1;
    letter-spacing: 0.2px;
}
.hospital-subtitle {
    font-size: 7.8pt;
    color: #64748b;
    margin-top: 1px;
}

.doc-badge {
    text-align: center;
    background-color: #f0f9ff;
    border: 1.5px solid #0284c7;
    color: #0369a1;
    font-size: 11pt;
    font-weight: bold;
    padding: 3px 6px;
    margin: 5px 0 7px 0;
    border-radius: 3px;
}
.doc-badge-danger {
    text-align: center;
    background-color: #fef2f2;
    border: 1.5px solid #ef4444;
    color: #b91c1c;
    font-size: 11pt;
    font-weight: bold;
    padding: 3px 6px;
    margin: 5px 0 7px 0;
    border-radius: 3px;
}

.meta-grid {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 7px;
}
.meta-grid td {
    padding: 2.5px 5px;
    font-size: 7.9pt;
    border: 1px solid #cbd5e1;
}
.meta-lbl {
    font-weight: bold;
    background-color: #f8fafc;
    color: #334155;
    width: 18%;
}

.section-hdr {
    font-size: 9.3pt;
    font-weight: bold;
    color: #0f172a;
    background-color: #f1f5f9;
    border-left: 3px solid #0284c7;
    padding: 2px 5px;
    margin-top: 6px;
    margin-bottom: 3px;
}

.table-custom {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 6px 0;
}
.table-custom th, .table-custom td {
    border: 1px solid #cbd5e1;
    padding: 3.5px 5px;
    font-size: 7.8pt;
    text-align: left;
}
.table-custom th {
    background-color: #f8fafc;
    color: #1e293b;
    font-weight: bold;
}

.vitals-box {
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 3px 6px;
    margin: 3px 0 5px 0;
    font-size: 8.0pt;
}

.rx-symbol {
    font-size: 15pt;
    font-weight: bold;
    font-style: italic;
    color: #0284c7;
    margin-right: 4px;
}

.signature-row {
    width: 100%;
    margin-top: 6px;
    border: none;
}
.signature-row td {
    border: none;
    padding: 0;
    font-size: 7.8pt;
    vertical-align: bottom;
}
.signature-stamp {
    display: inline-block;
    border: 1px dashed #64748b;
    padding: 3px 6px;
    border-radius: 3px;
    background-color: #fafafa;
}
"""

def render_doc(filename, html_content):
    pdf_path = os.path.join(OUTPUT_DIR, filename)
    full_html = f"<style>{BASE_CSS}</style>\n<body>\n{html_content}\n</body>"
    
    writer = fitz.DocumentWriter(pdf_path)
    story = fitz.Story(full_html, archive=arch)
    
    # Standard A4: 595 x 842 points. Margin: 28pt left/right, 24pt top/bottom
    story.write(
        writer,
        rectfn=lambda rect_num, filled: (
            fitz.Rect(0, 0, 595, 842),
            fitz.Rect(28, 24, 595 - 28, 842 - 24),
            None
        )
    )
    writer.close()
    
    doc = fitz.open(pdf_path)
    print(f"Generated {filename} ({len(doc)} pages)")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=150)
        img_name = filename.replace(".pdf", f"_p{i+1}.png") if len(doc) > 1 else filename.replace(".pdf", ".png")
        pix.save(os.path.join(OUTPUT_DIR, img_name))
    return doc

# ==============================================================================
# 1. EMERGENCY ADMISSION / CASUALTY NOTE (Doctor Notes)
# ==============================================================================
DOC_01 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Sector 12, Vidhyadhar Nagar, Jaipur, Rajasthan 302039 | NABH Accredited | Tel: +91-141-2334500</div>
</div>

<div class='doc-badge'>EMERGENCY CASUALTY CARD & ADMISSION NOTE (आपातकालीन प्रवेश नोट)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>APX-2026-88412 / IP-4491</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Date & Time:</td><td><strong>12-03-2026 at 10:45 AM</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Attending Doctor:</td><td>Dr. Arvind Sharma, MS (Gen Surg)</td>
    <td class='meta-lbl'>Department:</td><td>Casualty / Department of General Surgery</td>
  </tr>
</table>

<div class='section-hdr'>CHIEF COMPLAINTS & HISTORY (मुख्य शिकायतें व बीमारी का विवरण):</div>
<p style='margin: 2px 0;'>1. <strong>c/o Severe right lower abdominal pain</strong> (पेट के निचले दाहिने हिस्से में तेज दर्द) since 2 days, started periumbilical, now localized to right iliac fossa (RIF).</p>
<p style='margin: 2px 0;'>2. <strong>c/o Fever with chills</strong> (तेज बुखार व ठंड लगना) since yesterday (101°F).</p>
<p style='margin: 2px 0;'>3. <strong>c/o Nausea and vomiting</strong> (उल्टी व मिचली) x 3 episodes today morning; unable to tolerate oral fluids.</p>
<p style='margin: 2px 0;'>4. <strong>k/c/o:</strong> No prior history of HTN, T2DM, TB or Asthma. No prior abdominal surgeries.</p>
<p style='margin: 2px 0;'>5. <strong>Allergies:</strong> No known drug allergies (NKDA) reported (किसी दवा से कोई ज्ञात एलर्जी नहीं).</p>

<div class='section-hdr'>VITALS ON ARRIVAL (प्रवेश के समय वाइटल्स):</div>
<div class='vitals-box'>
  <strong>BP:</strong> 124/80 mmHg &nbsp;|&nbsp;
  <strong>Pulse (HR):</strong> 96 bpm (tachycardia) &nbsp;|&nbsp;
  <strong>Temp:</strong> 100.8°F (fever) &nbsp;|&nbsp;
  <strong>SpO2:</strong> 99% on room air &nbsp;|&nbsp;
  <strong>RR:</strong> 20/min &nbsp;|&nbsp;
  <strong>GCS:</strong> 15/15 (Fully conscious & oriented)
</div>

<div class='section-hdr'>CLINICAL EXAMINATION (शारीरिक परीक्षण):</div>
<p style='margin: 2px 0;'>- <strong>Abdomen:</strong> Inspection reveals no distension, moves with respiration. Palpation demonstrates marked <strong>McBurney's point tenderness (+)</strong> and marked <strong>Rebound tenderness (+)</strong> in Right Iliac Fossa. Localised muscle guarding present over RIF. Rovsing's sign (+). Psoas test (+). Bowel sounds sluggish.</p>
<p style='margin: 2px 0;'>- <strong>Chest / CVS:</strong> S1, S2 heard, chest clear bilaterally, no added sounds.</p>

<div class='section-hdr'>PROVISIONAL DIAGNOSIS (संभावित निदान):</div>
<p style='margin: 2px 0; font-size: 9.5pt;'><strong>Acute Appendicitis with Localised Peritonitis (तीव्र अपेंडिसाइटिस)</strong></p>

<div class='section-hdr'>EMERGENCY MANAGEMENT & ORDERS (आपातकालीन उपचार व निर्देश):</div>
<ol style='margin: 2px 0 4px 16px; padding: 0;'>
  <li>Admit to Surgical Ward (Bed 204) under Dr. Arvind Sharma (Surgery Unit II).</li>
  <li><strong>Keep strictly NPO (Nil Per Oral / खाली पेट)</strong> - prepare for emergency surgery.</li>
  <li>Start IV Fluids: Normal Saline (0.9% NS) 1 Pint IV stat over 1 hour, followed by RL @ 100 ml/hr.</li>
  <li><strong>Inj. Ceftriaxone 1g IV stat</strong> after negative skin sensitivity test (AST done & negative).</li>
  <li><strong>Inj. Dynapar 75mg IM stat</strong> for pain relief (दर्द निवारक).</li>
  <li><strong>Inj. Pantocid 40mg IV stat</strong>.</li>
  <li>Urgent Investigations: Stat CBC, Blood Urea, S. Creatinine, Random Blood Sugar, Serum Electrolytes, Blood Grouping & Crossmatch, HIV/HBsAg/HCV screening.</li>
  <li>Urgent Ultrasound (USG) Whole Abdomen & Pelvis.</li>
  <li>Obtain informed written surgical and anaesthetic consent. Plan for <strong>Laparoscopic Appendectomy</strong> today.</li>
</ol>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      Time of Examination: 10:45 hrs<br>
      Casualty Medical Officer (CMO): Dr. Neha Joshi, MBBS
    </td>
    <td style='width: 50%; text-align: right;'>
      <div class='signature-stamp'>
        <strong>Dr. Arvind Sharma, MS, FIAGES</strong><br>
        Senior Consultant General & Laparoscopic Surgeon<br>
        Reg. No: MCI/14582/2014 | Apex Hospital
      </div>
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 2. INFORMED CONSENT FORM (Consent Form in Hindi & English)
# ==============================================================================
DOC_02 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Sector 12, Vidhyadhar Nagar, Jaipur, Rajasthan 302039 | NABH Accredited | Tel: +91-141-2334500</div>
</div>

<div class='doc-badge'>SURGICAL & ANAESTHETIC INFORMED CONSENT FORM (शल्य चिकित्सा एवं एनेस्थीसिया सहमति पत्र)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>APX-2026-88412 / IP-4491</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Date & Time:</td><td><strong>12-03-2026 at 11:30 AM</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Proposed Surgery:</td><td colspan='3'><strong>Laparoscopic Appendectomy (लेप्रोस्कोपिक अपेंडिसेक्टॉमी / दूरबीन द्वारा अपेंडिक्स ऑपरेशन)</strong> with possible conversion to Open Surgery if required</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Surgeon:</td><td>Dr. Arvind Sharma, MS</td>
    <td class='meta-lbl'>Anaesthetist:</td><td>Dr. Sunita Meena, MD</td>
  </tr>
</table>

<div class='section-hdr'>CONSENT DECLARATION BY PATIENT / GUARDIAN (मरीज़ / अभिभावक द्वारा सहमति घोषणा):</div>
<p style='margin: 3px 0; font-size: 8.6pt;'>
1. मैं <strong>रमेश कुमार</strong>, उम्र 38 वर्ष, प्रमाणित करता हूँ कि मुझे मेरे रोग <strong>Acute Appendicitis (तीव्र अपेंडिसाइटिस)</strong> तथा प्रस्तावित ऑपरेशन <strong>Laparoscopic Appendectomy</strong> के बारे में डॉक्टर द्वारा मेरी समझी जाने वाली भाषा में विस्तार से समझा दिया गया है।<br>
2. मुझे यह भली-भांति समझा दिया गया है कि ऑपरेशन के दौरान यदि कोई तकनीकी जटिलता या अत्यधिक चिपकाव (dense adhesions) पाया जाता है तो दूरबीन विधि को खुले ऑपरेशन (Conversion to Open Appendectomy) में बदलना पड़ सकता है।<br>
3. ऑपरेशन तथा एनेस्थीसिया से जुड़े सामान्य एवं विशेष जोखिम जैसे कि रक्तस्राव (bleeding), संक्रमण (infection), आसपास के अंगों में चोट (injury to bowel/viscera), एनेस्थीसिया की प्रतिक्रिया (allergic reaction to drugs), तथा रक्त चढ़ाने (blood transfusion) की संभावना के बारे में मुझे अवगत करा दिया गया है।<br>
4. मैं पूरे होशोहवास में, बिना किसी अनुचित दबाव के, स्वेच्छा से इस शल्य चिकित्सा तथा जनरल एनेस्थीसिया (GA) के लिए अपनी पूर्ण सहमति प्रदान करता हूँ।
</p>

<div class='section-hdr'>SURGEON & ANAESTHETIST DECLARATION (चिकित्सक घोषणा):</div>
<p style='margin: 3px 0; font-size: 8.6pt;'>
I confirm that I have explained the nature, purpose, anticipated benefits, foreseeable risks, alternatives, and potential complications of the proposed procedure (Laparoscopic Appendectomy) and General Anaesthesia to the patient in Hindi. The patient appears to understand and has freely given informed consent.
</p>

<table class='table-custom' style='margin-top: 6px;'>
  <tr>
    <th style='width: 33%;'>Patient / Guardian (मरीज़ / अभिभावक)</th>
    <th style='width: 33%;'>Witness / Relative (गवाह / संबंधी)</th>
    <th style='width: 34%;'>Treating Surgeon (शल्य चिकित्सक)</th>
  </tr>
  <tr style='height: 55px; vertical-align: top;'>
    <td>
      <strong>Signature:</strong> रमेश कुमार (Ramesh Kumar)<br>
      Relationship: Self (स्वयं)<br>
      Contact: 98290-XXXXX<br>
      Date: 12-03-2026 | Time: 11:35 AM
    </td>
    <td>
      <strong>Signature:</strong> सुरेश कुमार (Suresh Kumar)<br>
      Relationship: Brother (भाई)<br>
      Address: Jaipur, Rajasthan<br>
      Date: 12-03-2026 | Time: 11:35 AM
    </td>
    <td>
      <strong>Signature:</strong> Dr. Arvind Sharma<br>
      Dr. Arvind Sharma, MS<br>
      Reg. No: MCI/14582/2014<br>
      Date: 12-03-2026 | Time: 11:40 AM
    </td>
  </tr>
</table>

<div class='section-hdr'>PRE-OPERATIVE CHECKLIST & VERIFICATION (ऑपरेशन पूर्व जांच सूची):</div>
<table class='table-custom'>
  <tr>
    <td><strong>NPO Status Confirmed:</strong> Yes (खाली पेट since 04:00 AM)</td>
    <td><strong>Blood Group:</strong> B Positive (B +ve)</td>
    <td><strong>Dentures / Jewellery Removed:</strong> Yes</td>
  </tr>
  <tr>
    <td><strong>Surgical Site Marked:</strong> Yes (Right Lower Abdomen)</td>
    <td><strong>Consent Signed & Attached:</strong> Yes</td>
    <td><strong>Pre-op Vitals:</strong> BP 126/82, HR 92/min, SpO2 99%</td>
  </tr>
</table>
"""

# ==============================================================================
# 3. OPERATION RECORD (Operation Notes)
# ==============================================================================
DOC_03 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Sector 12, Vidhyadhar Nagar, Jaipur, Rajasthan 302039 | NABH Accredited | Tel: +91-141-2334500</div>
</div>

<div class='doc-badge'>OPERATION RECORD / शल्य चिकित्सा विवरण (OT NOTE)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>APX-2026-88412 / IP-4491</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Date & OT No:</td><td><strong>12-03-2026 / OT-03 (Modular)</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Operating Surgeon:</td><td>Dr. Arvind Sharma, MS (Gen Surg)</td>
    <td class='meta-lbl'>Assistant Surgeon:</td><td>Dr. P. K. Verma, DNB (Gen Surg)</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Anaesthetist:</td><td>Dr. Sunita Meena, MD (Anaesthesia)</td>
    <td class='meta-lbl'>Scrub Nurse:</td><td>Staff Nurse Sunita Yadav</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Pre-op Diagnosis:</td><td colspan='3'>Acute Appendicitis with Localised Peritonitis (तीव्र अपेंडिसाइटिस)</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Post-op Diagnosis:</td><td colspan='3'>Gangrenous Non-Perforated Appendicitis (गैंग्रीनस अपेंडिसाइटिस)</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Procedure Performed:</td><td colspan='3'><strong>Laparoscopic Appendectomy (लेप्रोस्कोपिक अपेंडिसेक्टॉमी)</strong></td>
  </tr>
</table>

<div class='section-hdr'>OPERATIVE TIMELINES & ANAESTHESIA:</div>
<p style='margin: 2px 0;'><strong>Time:</strong> Wheel in: 14:00 | Incision: 14:15 | Procedure completed: 15:10 | Wheel out to PACU: 15:30</p>
<p style='margin: 2px 0;'><strong>Anaesthesia Type:</strong> General Anaesthesia with endotracheal intubation (जनरल एनेस्थीसिया). Pre-med: Inj. Glycopyrrolate 0.2mg IV, Inj. Fentanyl 100mcg IV. Induction: Inj. Propofol 120mg IV, Inj. Atracurium 35mg IV. Maintained on O2 + N2O + Sevoflurane.</p>

<div class='section-hdr'>OPERATIVE PROCEDURE & FINDINGS (शल्य क्रिया विवरण):</div>
<ol style='margin: 2px 0 5px 16px; padding: 0;'>
  <li>Patient in supine position with slight Trendelenburg tilt under GA. Painting and sterile draping completed.</li>
  <li>Pneumoperitoneum created through sub-umbilical incision using Veress needle. 10mm primary camera port inserted. Intra-abdominal pressure maintained at 12 mmHg.</li>
  <li>Diagnostic laparoscopy performed: Appendix retrocecal, swollen, turgid, with patchy gangrenous changes at the distal tip and fibrinous exudate. No overt perforation or generalized purulent peritonitis. Cecum and terminal ileum inspected and found healthy.</li>
  <li>Two 5mm accessory ports placed in Left Iliac Fossa and Suprapubic region under direct visual guidance.</li>
  <li>Mesoappendix dissected and coagulated with bipolar electrosurgery. Appendicular artery identified, clipped with medium Ligaclips, and divided cleanly.</li>
  <li>Base of appendix identified clearly. Appendicular base ligated using Endoloop (Vicryl 0) x 2. Stump divided cleanly 3mm distal to ligatures. No mucosal eversion.</li>
  <li>Appendix specimen placed in sterile endobag and retrieved via 10mm umbilical port. Specimen labelled and sent for <strong>Histopathological Examination (HPE)</strong>.</li>
  <li>Thorough peritoneal lavage performed with 500 ml warm sterile normal saline. Clear fluid aspirated. Hemostasis confirmed in appendicular bed.</li>
  <li>Instrument, gauze, and laparotomy sponge count verified <strong>correct and complete x 2</strong> by scrub nurse and surgeon.</li>
  <li>Desufflation done. 10mm port fascial defect closed with Vicryl 1-0. Skin incisions closed with Monocryl 3-0 subcuticular sutures. Sterile dressing applied.</li>
</ol>
<p style='margin: 2px 0;'><strong>Estimated Blood Loss:</strong> ~25 ml (Minimal) | <strong>Urine Output in OT:</strong> 150 ml clear | <strong>Complications:</strong> None</p>
<p style='margin: 2px 0;'><strong>Immediate Post-op Status:</strong> Patient extubated smoothly on table, conscious, responding to commands, shifted to PACU in stable condition (BP 122/78, HR 82/min, SpO2 99% on 2L O2).</p>

<div class='section-hdr'>POST-OPERATIVE ORDERS (ऑपरेशन पश्चात निर्देश):</div>
<ul style='margin: 2px 0 5px 16px; padding: 0;'>
  <li>NPO (Nil Per Oral) till bowel sounds return; assess oral sips on POD 1 morning (13/03/2026).</li>
  <li>IV Fluids: Ringer Lactate (RL) @ 100 ml/hr.</li>
  <li><strong>Inj. Ceftriaxone 1g IV BD</strong> (इंज. सेफ्ट्रिएक्सोन 1 ग्राम IV दिन में दो बार) x 3 days.</li>
  <li><strong>Inj. Metronidazole 500mg IV TDS</strong> (इंज. मेट्रोनिडाजोल 500mg IV दिन में तीन बार) x 3 days.</li>
  <li><strong>Inj. Pantocid 40mg IV OD</strong> (इंज. पैंटोसिड 40mg IV) empty stomach.</li>
  <li><strong>Inj. Dynapar (Diclofenac) 75mg IM SOS</strong> for severe post-op pain.</li>
  <li>Check vitals 2 hourly (BP, PR, SpO2, Temp, RR) and report any tachycardia or fever.</li>
</ul>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      <strong>Dr. Sunita Meena, MD</strong><br>
      Consultant Anaesthesiologist<br>
      Reg. No: RMC/48911
    </td>
    <td style='width: 50%; text-align: right;'>
      <div class='signature-stamp'>
        <strong>Dr. Arvind Sharma, MS, FIAGES</strong><br>
        Lead Surgeon & Consultant Laparoscopic Surgery<br>
        Reg. No: MCI/14582/2014
      </div>
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 4. NURSING VITALS CHART & MEDICATION ADMINISTRATION RECORD (MAR)
# ==============================================================================
DOC_04 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Sector 12, Vidhyadhar Nagar, Jaipur, Rajasthan 302039 | NABH Accredited | Tel: +91-141-2334500</div>
</div>

<div class='doc-badge'>NURSING OBSERVATION CHART & MEDICATION ADMINISTRATION RECORD (नर्सिंग चार्ट व MAR)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>APX-2026-88412 / IP-4491</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Ward / Bed:</td><td>Surgical Ward / Bed 204</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Diagnosis:</td><td colspan='3'>Post-operative Day 0-1 (POD 0/1) Laparoscopic Appendectomy (तीव्र अपेंडिसाइटिस सर्जरी)</td>
  </tr>
</table>

<div class='section-hdr'>VITALS MONITORING FLOW-SHEET (तापमान, पल्स, बीपी रिकॉर्ड):</div>
<table class='table-custom'>
  <tr>
    <th>Date & Time</th>
    <th>Temp (°F)</th>
    <th>Pulse (bpm)</th>
    <th>BP (mmHg)</th>
    <th>RR (/min)</th>
    <th>SpO2 (%)</th>
    <th>Pain Score (0-10)</th>
    <th>Remarks / Nurse Signature</th>
  </tr>
  <tr>
    <td>12/03 11:00</td>
    <td>100.8°F</td>
    <td>96</td>
    <td>124/80</td>
    <td>20</td>
    <td>99%</td>
    <td>7 (severe RIF)</td>
    <td>Admission in ward, IV NS started (Nurse Priya)</td>
  </tr>
  <tr>
    <td>12/03 13:30</td>
    <td>99.4°F</td>
    <td>92</td>
    <td>128/82</td>
    <td>18</td>
    <td>99%</td>
    <td>6</td>
    <td>Shifted to OT, pre-op checklist done (Nurse Priya)</td>
  </tr>
  <tr>
    <td>12/03 16:00</td>
    <td>99.0°F</td>
    <td>88</td>
    <td>118/76</td>
    <td>18</td>
    <td>99%</td>
    <td>5 (incisional)</td>
    <td>Received from PACU, conscious, dressing dry (Nurse Sunita)</td>
  </tr>
  <tr>
    <td>12/03 18:00</td>
    <td>98.8°F</td>
    <td>86</td>
    <td>120/78</td>
    <td>16</td>
    <td>98%</td>
    <td>4</td>
    <td>Stable, IV RL running @ 100 ml/hr (Nurse Sunita)</td>
  </tr>
  <tr>
    <td>12/03 20:00</td>
    <td>98.6°F</td>
    <td>84</td>
    <td>120/80</td>
    <td>16</td>
    <td>99%</td>
    <td>3</td>
    <td>Voided clear urine 350 ml (Nurse Sunita)</td>
  </tr>
  <tr>
    <td>12/03 22:00</td>
    <td>98.4°F</td>
    <td>80</td>
    <td>122/78</td>
    <td>16</td>
    <td>98%</td>
    <td>2</td>
    <td>Night round, comfortable, sleeping (Nurse Sunita)</td>
  </tr>
  <tr>
    <td>13/03 06:00</td>
    <td>98.6°F</td>
    <td>78</td>
    <td>120/76</td>
    <td>16</td>
    <td>99%</td>
    <td>2</td>
    <td>Morning round. Flatus passed (+). Bowel sounds (+) (Nurse Priya)</td>
  </tr>
  <tr>
    <td>13/03 10:00</td>
    <td>98.4°F</td>
    <td>76</td>
    <td>118/74</td>
    <td>16</td>
    <td>99%</td>
    <td>1</td>
    <td>Doctor round attended, oral sips allowed (Nurse Priya)</td>
  </tr>
</table>

<div class='section-hdr'>MEDICATION ADMINISTRATION RECORD - MAR (दी गई दवाइयों का विवरण):</div>
<table class='table-custom'>
  <tr>
    <th>Drug Name & Dose</th>
    <th>Route</th>
    <th>Scheduled Time</th>
    <th>Actual Given</th>
    <th>Given By (Nurse)</th>
    <th>Batch No</th>
    <th>Nurse Notes / टिप्पणी</th>
  </tr>
  <tr>
    <td><strong>Inj. Ceftriaxone 1 g</strong></td>
    <td>IV</td>
    <td>12/03 11:15 (Stat)</td>
    <td>11:15</td>
    <td>Staff Nurse Priya</td>
    <td>CTX-4029</td>
    <td>Skin test negative. इंज. सेफ्ट्रिएक्सोन 1 ग्राम IV दिया गया</td>
  </tr>
  <tr>
    <td><strong>Inj. Dynapar 75 mg</strong></td>
    <td>IM</td>
    <td>12/03 11:30 (Stat)</td>
    <td>11:30</td>
    <td>Staff Nurse Priya</td>
    <td>DYN-8821</td>
    <td>Given deep IM for severe pain (दर्द निवारक इंजेक्शन)</td>
  </tr>
  <tr>
    <td><strong>Inj. Pantocid 40 mg</strong></td>
    <td>IV</td>
    <td>12/03 16:30 (OD)</td>
    <td>16:30</td>
    <td>Staff Nurse Sunita</td>
    <td>PAN-9104</td>
    <td>Post-op dose given slow IV</td>
  </tr>
  <tr>
    <td><strong>Inj. Metronidazole 500 mg</strong></td>
    <td>IV</td>
    <td>12/03 17:00 (TDS)</td>
    <td>17:00</td>
    <td>Staff Nurse Sunita</td>
    <td>MTZ-1209</td>
    <td>Infused over 30 mins (इंज. मेट्रोनिडाजोल 500mg IV)</td>
  </tr>
  <tr>
    <td><strong>Inj. Ceftriaxone 1 g</strong></td>
    <td>IV</td>
    <td>12/03 22:00 (BD)</td>
    <td>22:00</td>
    <td>Staff Nurse Sunita</td>
    <td>CTX-4029</td>
    <td><strong>इंज. सेफ्ट्रिएक्सोन 1 ग्राम IV दिया गया</strong> (No reaction)</td>
  </tr>
  <tr>
    <td><strong>Inj. Metronidazole 500 mg</strong></td>
    <td>IV</td>
    <td>13/03 01:00 (TDS)</td>
    <td>01:05</td>
    <td>Staff Nurse Sunita</td>
    <td>MTZ-1209</td>
    <td>IV infusion running smoothly</td>
  </tr>
  <tr>
    <td><strong>Inj. Pantocid 40 mg</strong></td>
    <td>IV</td>
    <td>13/03 07:00 (OD)</td>
    <td>07:00</td>
    <td>Staff Nurse Priya</td>
    <td>PAN-9104</td>
    <td>Morning empty stomach dose</td>
  </tr>
  <tr>
    <td><strong>Inj. Ceftriaxone 1 g</strong></td>
    <td>IV</td>
    <td>13/03 10:00 (BD)</td>
    <td>10:00</td>
    <td>Staff Nurse Priya</td>
    <td>CTX-4030</td>
    <td>Second day morning dose administered</td>
  </tr>
</table>

<div class='section-hdr'>NURSE SHIFT HANDOVER NOTE (नर्स हैंडओवर नोट):</div>
<p style='margin: 2px 0;'>
<strong>12/03 Night Shift Note (22:30 hrs):</strong> मरीज़ रमेश कुमार होश में है। वाइटल्स सामान्य हैं (BP 122/78, P 80, T 98.4°F)। रात 10 बजे इंज. सेफ्ट्रिएक्सोन 1 ग्राम IV दिया गया। कोई उल्टी या बुखार नहीं है। यूरिन आउटपुट संतोषजनक है (700 ml in 8 hrs)। दर्द में काफी सुधार है। ड्रेसिंग सूखी व साफ है। - <em>Staff Nurse Sunita Yadav, GNM</em>
</p>
"""

# ==============================================================================
# 5. LAB REPORT & IMAGING ULTRASOUND (Investigation Results)
# ==============================================================================
DOC_05 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Department of Laboratory Medicine & Radiodiagnosis | NABL Accredited Lab | Tel: +91-141-2334510</div>
</div>

<div class='doc-badge'>LABORATORY & RADIODIAGNOSIS INVESTIGATION REPORT (जांच रिपोर्ट)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / Sample ID:</td><td>APX-2026-88412 / LAB-77192</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Referred By:</td><td>Dr. Arvind Sharma, MS</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Sample Collected:</td><td>12-03-2026 11:05 AM</td>
    <td class='meta-lbl'>Report Authorized:</td><td><strong>12-03-2026 12:20 PM</strong></td>
  </tr>
</table>

<div class='section-hdr'>COMPLETE BLOOD COUNT - CBC (पूर्ण रक्त गणना):</div>
<table class='table-custom'>
  <tr>
    <th>Investigation / Test</th>
    <th>Observed Value</th>
    <th>Reference Range</th>
    <th>Units</th>
    <th>Status / Flag</th>
  </tr>
  <tr>
    <td>Hemoglobin (Hb)</td>
    <td><strong>14.2</strong></td>
    <td>13.0 - 17.0</td>
    <td>g/dL</td>
    <td>Normal</td>
  </tr>
  <tr style='background-color: #fffbeb;'>
    <td><strong>Total Leukocyte Count (TLC / WBC)</strong></td>
    <td><strong>15,400</strong></td>
    <td>4,000 - 11,000</td>
    <td>/cu mm</td>
    <td><strong style='color: #b91c1c;'>HIGH (Leukocytosis)</strong></td>
  </tr>
  <tr style='background-color: #fffbeb;'>
    <td><strong>Neutrophils</strong></td>
    <td><strong>84</strong></td>
    <td>40 - 75</td>
    <td>%</td>
    <td><strong style='color: #b91c1c;'>HIGH (Neutrophilia)</strong></td>
  </tr>
  <tr>
    <td>Lymphocytes</td>
    <td>12</td>
    <td>20 - 45</td>
    <td>%</td>
    <td>Low</td>
  </tr>
  <tr>
    <td>Eosinophils</td>
    <td>02</td>
    <td>01 - 06</td>
    <td>%</td>
    <td>Normal</td>
  </tr>
  <tr>
    <td>Monocytes</td>
    <td>02</td>
    <td>02 - 08</td>
    <td>%</td>
    <td>Normal</td>
  </tr>
  <tr>
    <td>Platelet Count</td>
    <td>2.45</td>
    <td>1.50 - 4.50</td>
    <td>Lakhs/cu mm</td>
    <td>Normal</td>
  </tr>
</table>

<div class='section-hdr'>BIOCHEMISTRY & RENAL FUNCTION:</div>
<table class='table-custom'>
  <tr>
    <th>Test</th><th>Observed</th><th>Reference</th><th>Test</th><th>Observed</th><th>Reference</th>
  </tr>
  <tr>
    <td>Random Blood Sugar (RBS)</td><td>114 mg/dL</td><td>70 - 140</td>
    <td>Serum Creatinine</td><td>0.92 mg/dL</td><td>0.70 - 1.20</td>
  </tr>
  <tr>
    <td>Blood Urea</td><td>24 mg/dL</td><td>15 - 45</td>
    <td>Serum Sodium (Na+)</td><td>139 mEq/L</td><td>135 - 145</td>
  </tr>
  <tr>
    <td>Serum Potassium (K+)</td><td>4.2 mEq/L</td><td>3.5 - 5.0</td>
    <td>Blood Group & Rh</td><td><strong>B Positive (B +ve)</strong></td><td>--</td>
  </tr>
</table>

<div class='section-hdr'>ULTRASOUND WHOLE ABDOMEN & PELVIS (सोनोग्राफी रिपोर्ट):</div>
<p style='margin: 2px 0;'><strong>Clinical Indication:</strong> Acute right lower quadrant abdominal pain, fever, RIF tenderness (c/o Acute Appendicitis).</p>
<p style='margin: 2px 0;'><strong>Findings:</strong></p>
<ul style='margin: 2px 0 4px 16px; padding: 0;'>
  <li>Liver, Gallbladder, Pancreas, Spleen and both Kidneys are normal in size, shape and echotexture. No focal lesion or calculus.</li>
  <li><strong>Right Iliac Fossa (RIF) Examination:</strong> Real-time high-resolution linear probe scanning reveals a blind-ending, non-compressible, aperistaltic tubular structure in the retrocecal region arising from the cecal base.</li>
  <li>Maximum outer wall diameter measures <strong>8.8 mm</strong> (normal up to 6.0 mm). Increased mural vascularity noted on Color Doppler.</li>
  <li>Prominent hyperechoic periappendiceal mesenteric fat stranding observed. Minimal reactive free fluid noted in RIF and pelvic cavity. No loculated abscess seen.</li>
</ul>
<p style='margin: 2px 0; font-size: 9.3pt;'>
<strong>IMPRESSION:</strong> Sonographic features are diagnostic of <strong>Acute Appendicitis with Localised Periappendiceal Inflammation (तीव्र अपेंडिसाइटिस)</strong>. Clinical and surgical correlation advised.
</p>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      <strong>Dr. Kavita Bansal, MD (Pathology)</strong><br>
      Consultant Pathologist | Reg: RMC/29401
    </td>
    <td style='width: 50%; text-align: right;'>
      <strong>Dr. Sandeep Choudhary, MD, DMRD</strong><br>
      Consultant Radiologist | Reg: RMC/33890
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 6. DISCHARGE SUMMARY (Discharge Summary)
# ==============================================================================
DOC_06 = """
<div class='hospital-header'>
  <div class='hospital-title'>APEX MULTISPECIALITY HOSPITAL & RESEARCH CENTRE</div>
  <div class='hospital-subtitle'>Sector 12, Vidhyadhar Nagar, Jaipur, Rajasthan 302039 | NABH Accredited | Tel: +91-141-2334500</div>
</div>

<div class='doc-badge'>DISCHARGE SUMMARY / डिस्चार्ज सारांश</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Ramesh Kumar (रमेश कुमार)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>APX-2026-88412 / IP-4491</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>38 Yrs / Male</td>
    <td class='meta-lbl'>Ward / Bed:</td><td>Surgical Ward / Bed 204</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Date of Admission:</td><td><strong>12-03-2026 at 10:45 AM</strong></td>
    <td class='meta-lbl'>Date of Discharge:</td><td><strong>15-03-2026 at 11:30 AM</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Consultant:</td><td>Dr. Arvind Sharma, MS (Gen Surg)</td>
    <td class='meta-lbl'>Surgery Performed:</td><td><strong>Laparoscopic Appendectomy (12-03-2026)</strong></td>
  </tr>
</table>

<div class='section-hdr'>FINAL DIAGNOSIS (अंतिम निदान):</div>
<p style='margin: 2px 0; font-size: 9.5pt;'>
<strong>Acute Gangrenous Non-Perforated Appendicitis (तीव्र गैंग्रीनस अपेंडिसाइटिस - ऑपरेशन पश्चात स्थिति)</strong>
</p>

<div class='section-hdr'>BRIEF CLINICAL SUMMARY & HOSPITAL COURSE (अस्पताल में उपचार का संक्षिप्त विवरण):</div>
<p style='margin: 2px 0;'>
Patient presented to casualty on 12-03-2026 with severe RIF abdominal pain, fever (101°F) and vomiting x 2 days. Examination showed McBurney's tenderness (+) and rebound tenderness (+). USG abdomen confirmed acute appendicitis (diameter 8.8 mm) with leukocytosis (TLC 15,400).
After pre-anaesthetic fitness and informed written consent, patient underwent emergency <strong>Laparoscopic Appendectomy</strong> under GA on 12-03-2026 at 14:15 hrs. Intra-operatively, retrocecal gangrenous appendix was removed in endobag. Post-operative period was completely uneventful. IV antibiotics (Ceftriaxone + Metronidazole) given. Oral fluids initiated on POD 1 (13/03) and tolerated well; stepped up to soft diet on POD 2 (14/03). Bowel sounds active, flatus and stools passed normally. Surgical wounds inspected today: healthy, clean, no redness or discharge.
</p>

<div class='section-hdr'>CONDITION AT DISCHARGE (डिस्चार्ज के समय स्थिति):</div>
<div class='vitals-box'>
  <strong>Vitals:</strong> BP 120/78 mmHg &nbsp;|&nbsp; Pulse 76 bpm (regular) &nbsp;|&nbsp; Temp 98.4°F (Afebrile) &nbsp;|&nbsp; SpO2 99% on RA<br>
  <strong>Abdomen:</strong> Soft, non-tender, no distension. Port site dressings clean & dry.
</div>

<div class='section-hdr'>DISCHARGE MEDICATIONS / घर पर लेने हेतु दवाइयां (Rx):</div>
<table class='table-custom'>
  <tr>
    <th>दवा का नाम (Medicine)</th>
    <th>खुराक (Dose)</th>
    <th>समय (Frequency)</th>
    <th>अवधि (Duration)</th>
    <th>निर्देश (Instructions)</th>
  </tr>
  <tr>
    <td><strong>Tab. Cefixime (Mahacef) 200 mg</strong></td>
    <td>200 mg</td>
    <td>1-0-1 (BD)</td>
    <td>5 Days</td>
    <td>सुबह-शाम भोजन के बाद (Antibiotic)</td>
  </tr>
  <tr>
    <td><strong>Tab. Metronidazole (Metrogyl) 400 mg</strong></td>
    <td>400 mg</td>
    <td>1-0-1 (BD)</td>
    <td>5 Days</td>
    <td>सुबह-शाम खाने के बाद</td>
  </tr>
  <tr>
    <td><strong>Tab. Pantocid 40 mg</strong></td>
    <td>40 mg</td>
    <td>1-0-0 (OD)</td>
    <td>7 Days</td>
    <td>सुबह खाली पेट (Empty stomach)</td>
  </tr>
  <tr>
    <td><strong>Tab. Dolo 650 mg (Paracetamol)</strong></td>
    <td>650 mg</td>
    <td>SOS (जरूरत पड़ने पर)</td>
    <td>As needed</td>
    <td>दर्द या बुखार होने पर (Max 3 tabs/day)</td>
  </tr>
  <tr>
    <td><strong>Syp. Duphalac (Lactulose)</strong></td>
    <td>15 ml</td>
    <td>0-0-1 (HS)</td>
    <td>3 Days</td>
    <td>रात को सोते समय (Stool softener)</td>
  </tr>
</table>

<div class='section-hdr'>FOLLOW-UP & POST-DISCHARGE ADVICE (अनुवर्ती सलाह):</div>
<p style='margin: 2px 0;'>1. Follow up in Surgical OPD with Dr. Arvind Sharma on <strong>22-03-2026 (7 days)</strong> for wound inspection and suture removal.</p>
<p style='margin: 2px 0;'>2. Normal light high-fiber diet with adequate water intake. Avoid oily, spicy food for 1 week.</p>
<p style='margin: 2px 0;'>3. Avoid heavy weight lifting (> 5 kg) or strenuous exercise for 4 weeks.</p>
<p style='margin: 2px 0;'>4. Keep surgical dressings completely dry. Sponge bath permitted.</p>
<p style='margin: 2px 0;'>5. <strong>Emergency Warning Signs:</strong> Report immediately to Emergency if high fever (>101°F), severe abdominal pain, persistent vomiting, or redness/discharge from wound sites occurs.</p>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      Discharge Prepared By: Dr. Neha Joshi, Resident MO<br>
      Discharge Date: 15-03-2026 | 11:30 AM
    </td>
    <td style='width: 50%; text-align: right;'>
      <div class='signature-stamp'>
        <strong>Dr. Arvind Sharma, MS, FIAGES</strong><br>
        Senior Consultant Laparoscopic Surgeon<br>
        Reg. No: MCI/14582/2014 | Apex Hospital
      </div>
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 7. OUTPATIENT PRESCRIPTION (Prescription in Hindi & English)
# ==============================================================================
DOC_07 = """
<div class='hospital-header'>
  <div class='hospital-title'>SHUBHAM MEDICAL CLINIC & DIABETES CARE CENTRE</div>
  <div class='hospital-subtitle'>B-44, Central Market, Lajpat Nagar II, New Delhi 110024 | Phone: 011-29841234, +91-98112-34567</div>
</div>

<table style='width: 100%; border: none; margin-bottom: 5px;'>
  <tr>
    <td style='border: none; width: 65%;'>
      <strong>Dr. Rajesh Gupta</strong>, MBBS, MD (Medicine)<br>
      <span style='font-size: 8pt; color: #475569;'>Senior Physician & Diabetologist | Formerly at Safdarjung Hospital, New Delhi<br>Reg. No: <strong>DMC/51204/2009</strong></span>
    </td>
    <td style='border: none; width: 35%; text-align: right; font-size: 8pt; color: #64748b;'>
      <strong>Timings:</strong> 10:00 AM - 02:00 PM<br>05:30 PM - 08:30 PM (Sunday Closed)
    </td>
  </tr>
</table>

<div class='doc-badge'>OUTPATIENT PRESCRIPTION / डॉक्टर का पर्चा (OPD Rx)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Sunita Devi (सुनीता देवी)</strong></td>
    <td class='meta-lbl'>OPD Reg No:</td><td><strong>SH-2026-10492</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>52 Yrs / Female</td>
    <td class='meta-lbl'>Date:</td><td><strong>16-03-2026</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Weight / Height:</td><td>68 kg / 156 cm</td>
    <td class='meta-lbl'>Contact:</td><td>98188-XXXXX (New Delhi)</td>
  </tr>
</table>

<div class='section-hdr'>CLINICAL HISTORY & VITALS (लक्षण एवं जांच):</div>
<p style='margin: 2px 0;'>- <strong>k/c/o:</strong> Type 2 Diabetes Mellitus (T2DM / मधुमेह) x 6 yrs; Hypertension (HTN / उच्च रक्तचाप) x 4 yrs on irregular medication.</p>
<p style='margin: 2px 0;'>- <strong>c/o:</strong> Persistent dry cough (लगातार सूखी खांसी) x 10 days, worse at night.</p>
<p style='margin: 2px 0;'>- <strong>c/o:</strong> Low-grade fever on & off (हल्का बुखार) x 4 days, generalized body ache & weakness (कमजोरी व बदन दर्द).</p>
<div class='vitals-box'>
  <strong>BP:</strong> 142/90 mmHg (Elevated) &nbsp;|&nbsp;
  <strong>Pulse:</strong> 82 bpm &nbsp;|&nbsp;
  <strong>Temp:</strong> 99.4°F &nbsp;|&nbsp;
  <strong>SpO2:</strong> 97% on room air &nbsp;|&nbsp;
  <strong>RBS (Glucometer):</strong> 192 mg/dL
</div>
<p style='margin: 2px 0;'>- <strong>Chest Examination:</strong> Bilateral coarse rhonchi present in right mid zone. No crepitations. Heart sounds normal.</p>
<p style='margin: 2px 0;'>- <strong>Provisional Diagnosis:</strong> <strong>Acute Bronchitis with Uncontrolled T2DM and Stage 1 HTN (श्वसन नली संक्रमण व अनियंत्रित शुगर)</strong></p>

<div class='section-hdr'><span class='rx-symbol'>℞</span> PRESCRIPTION (दवाइयां):</div>
<table class='table-custom'>
  <tr>
    <th>क्र.</th>
    <th>दवा का नाम (Brand & Generic Name)</th>
    <th>मात्रा (Dose)</th>
    <th>सेवन विधि (Frequency)</th>
    <th>अवधि</th>
    <th>निर्देश (Instructions)</th>
  </tr>
  <tr>
    <td>1</td>
    <td><strong>Tab. Augmentin 625 mg</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Amoxicillin 500mg + Clavulanate 125mg)</span></td>
    <td>625 mg</td>
    <td><strong>1-0-1</strong> (BD)</td>
    <td>5 Days</td>
    <td>सुबह व रात खाने के बाद (इंज/टैब ऑगमेंटिन)</td>
  </tr>
  <tr>
    <td>2</td>
    <td><strong>Tab. Telma 40 mg</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Telmisartan 40mg)</span></td>
    <td>40 mg</td>
    <td><strong>1-0-0</strong> (OD)</td>
    <td>30 Days</td>
    <td>रोजाना सुबह नाश्ते के बाद (बीपी की दवा)</td>
  </tr>
  <tr>
    <td>3</td>
    <td><strong>Tab. Glycomet 500 mg</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Metformin 500mg SR)</span></td>
    <td>500 mg</td>
    <td><strong>1-0-1</strong> (BD)</td>
    <td>30 Days</td>
    <td>सुबह व शाम भोजन के तुरंत बाद (शुगर की दवा)</td>
  </tr>
  <tr>
    <td>4</td>
    <td><strong>Syp. Ascoril-D Cough Syrup</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Dextromethorphan + Phenylephrine + CPM)</span></td>
    <td>10 ml</td>
    <td><strong>TDS (10ml - 10ml - 10ml)</strong></td>
    <td>5 Days</td>
    <td>दिन में 3 बार 2 चम्मच गुनगुने पानी के बाद</td>
  </tr>
  <tr>
    <td>5</td>
    <td><strong>Tab. Pan-D</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Pantoprazole 40mg + Domperidone 30mg)</span></td>
    <td>Capsule</td>
    <td><strong>1-0-0</strong> (OD)</td>
    <td>7 Days</td>
    <td>सुबह खाली पेट (खाली पेट - Before food)</td>
  </tr>
  <tr>
    <td>6</td>
    <td><strong>Tab. Dolo 650 mg</strong><br><span style='font-size: 7.5pt; color: #475569;'>(Paracetamol 650mg)</span></td>
    <td>650 mg</td>
    <td><strong>SOS</strong></td>
    <td>As needed</td>
    <td>तेज बदन दर्द या 100°F से अधिक बुखार होने पर</td>
  </tr>
</table>

<div class='section-hdr'>INVESTIGATIONS ORDERED & ADVICE (जांच सलाह):</div>
<p style='margin: 2px 0;'>1. <strong>Chest X-Ray PA View</strong> (छाती का एक्स-रे).</p>
<p style='margin: 2px 0;'>2. Stat <strong>HbA1c</strong>, Fasting Blood Sugar (FBS) & Post-Prandial Blood Sugar (PPBS), Complete Blood Count (CBC).</p>
<p style='margin: 2px 0;'>3. Diabetic diet: चीनी, गुड़, चावल, आलू व मीठे फलों से परहेज करें। गुनगुने पानी की भाप (steam inhalation) लें।</p>
<p style='margin: 2px 0;'>4. <strong>Review in OPD:</strong> 5 दिन बाद जांच रिपोर्ट के साथ पुनः दिखाएं (Review after 5 days).</p>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      Prescription Valid for 30 Days<br>
      Date: 16-03-2026
    </td>
    <td style='width: 50%; text-align: right;'>
      <div class='signature-stamp'>
        <strong>Dr. Rajesh Gupta, MD (Medicine)</strong><br>
        Consultant Physician & Diabetologist<br>
        Reg. No: DMC/51204/2009 | Shubham Clinic
      </div>
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 8. LAPAROSCOPIC CHOLECYSTECTOMY OPERATION RECORD (Operation Notes)
# ==============================================================================
DOC_08 = """
<div class='hospital-header'>
  <div class='hospital-title'>SANJEEVANI HEALTHCARE INSTITUTE & SUPER-SPECIALITY HOSPITAL</div>
  <div class='hospital-subtitle'>14/2 Ashok Marg, Hazratganj, Lucknow, Uttar Pradesh 226001 | Tel: +91-522-2621000 | NABH Accredited</div>
</div>

<div class='doc-badge'>OPERATIVE REPORT / शल्य चिकित्सा विवरण (LAPAROSCOPIC CHOLECYSTECTOMY)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Anita Sharma (अनीता शर्मा)</strong></td>
    <td class='meta-lbl'>UHID / IP No:</td><td>SJ-2026-30219 / IP-8921</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>45 Yrs / Female</td>
    <td class='meta-lbl'>Date & OT:</td><td><strong>14-03-2026 / OT-02</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl'>Surgeon:</td><td>Dr. Manoj Sinha, MS, MCh (Surg Gastro)</td>
    <td class='meta-lbl'>Assistant:</td><td>Dr. Alok Srivastava, MS (Gen Surg)</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Anaesthetist:</td><td>Dr. Ritu Saxena, DA, DNB (Anaesth)</td>
    <td class='meta-lbl'>Scrub Nurse:</td><td>Staff Nurse Rekha Devi</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Pre-op Diagnosis:</td><td colspan='3'>Symptomatic Cholelithiasis with Chronic Cholecystitis (पित्ताशय की पथरी)</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Post-op Diagnosis:</td><td colspan='3'>Chronic Calculous Cholecystitis with Multiple Mixed Gallstones</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Procedure Done:</td><td colspan='3'><strong>Laparoscopic Cholecystectomy (लेप्रोस्कोपिक कोलेसिस्टेक्टॉमी / दूरबीन द्वारा पित्ताशय निष्कासन)</strong></td>
  </tr>
</table>

<div class='section-hdr'>ANAESTHESIA & OPERATIVE DETAILS:</div>
<p style='margin: 2px 0;'><strong>Time of Surgery:</strong> Wheel in: 09:30 | Incision: 09:45 | Procedure complete: 10:45 | Wheel out: 11:15</p>
<p style='margin: 2px 0;'><strong>Anaesthesia:</strong> General Anaesthesia with ET Intubation. Premedication with Inj. Midazolam 1mg, Inj. Fentanyl 100mcg. Intubated with 7.0 cuffed ET tube. Uneventful induction.</p>

<div class='section-hdr'>OPERATIVE PROCEDURE & FINDINGS:</div>
<ol style='margin: 2px 0 5px 16px; padding: 0;'>
  <li>Patient in supine position with reverse Trendelenburg tilt and left lateral tilt. Painting and sterile draping done.</li>
  <li>Pneumoperitoneum established using open Hasson's technique through infra-umbilical incision. 10mm Hasson cannula placed. 10mm epigastric port, 5mm right anterior axillary port, and 5mm right mid-clavicular subcostal port placed under direct vision (Standard 4-port technique).</li>
  <li>Diagnostic laparoscopy revealed thick-walled, contracted gallbladder with omental adhesions to the Hartmann's pouch and fundus. Adhesions freed using sharp and blunt dissection with hook electrocautery.</li>
  <li>Fundus retracted towards right shoulder and Hartmann's pouch retracted infero-laterally. Calot's triangle dissected meticulously.</li>
  <li><strong>Critical View of Safety (CVS) achieved:</strong> Lower third of gallbladder dissected off the cystic plate, and only two structures seen entering the gallbladder (cystic duct and cystic artery). Common Bile Duct (CBD) identified and kept well away.</li>
  <li>Cystic duct clipped with 3 titanium Ligaclips (2 patient side, 1 specimen side) and divided. Cystic artery clipped with 3 Ligaclips and divided.</li>
  <li>Gallbladder dissected retrogradely from liver bed with hook cautery. Liver bed hemostasis secured with bipolar cautery.</li>
  <li>Gallbladder placed into endobag and delivered via 10mm umbilical port. Gallbladder opened on sterile tray: contains 16 multifaceted mixed cholesterol stones (पित्त की पथरी). Specimen sent for HPE.</li>
  <li>Peritoneal cavity irrigated with normal saline. Subhepatic space dry. Abdominal swab and instrument counts verified <strong>correct and intact</strong>.</li>
  <li>Port sites closed. Subumbilical rectus sheath closed with Loop PDS 1-0. Skin approximated with Monocryl 3-0.</li>
</ol>
<p style='margin: 2px 0;'><strong>Estimated Blood Loss:</strong> ~20 ml | <strong>Complications:</strong> None | <strong>Status:</strong> Extubated, stable, shifted to Recovery Room.</p>

<div class='section-hdr'>POST-OPERATIVE ORDERS (ऑपरेशन पश्चात निर्देश):</div>
<ul style='margin: 2px 0 5px 16px; padding: 0;'>
  <li>Keep NPO for 6 hours; start sips of water at 17:00 hrs if bowel sounds audible and no nausea.</li>
  <li>IV Fluids: Isolyte-P @ 80 ml/hr.</li>
  <li><strong>Inj. Cefoperazone-Sulbactam (Magnex) 1.5g IV BD</strong> x 2 days.</li>
  <li><strong>Inj. Paracetamol 1g IV Infusion TDS</strong> for analgesia.</li>
  <li><strong>Inj. Ondansetron 4mg IV SOS</strong> for nausea/vomiting.</li>
  <li><strong>Inj. Pantocid 40mg IV OD</strong>.</li>
  <li>Monitor vitals every 2 hours x 6 hours, then 4 hourly. Mobilize out of bed in the evening.</li>
</ul>

<table class='signature-row'>
  <tr>
    <td style='width: 50%;'>
      <strong>Dr. Ritu Saxena, DA, DNB</strong><br>
      Consultant Anaesthesiologist<br>
      Reg. No: UP/31904
    </td>
    <td style='width: 50%; text-align: right;'>
      <div class='signature-stamp'>
        <strong>Dr. Manoj Sinha, MS, MCh (Surg Gastro)</strong><br>
        Chief GI & Minimal Access Surgeon<br>
        Reg. No: UP/18442 | Sanjeevani Institute
      </div>
    </td>
  </tr>
</table>
"""

# ==============================================================================
# 9. CLINICAL RECORD WITH CARE DEVIATIONS & GAPS (Testing Chronicle Findings Rules)
# ==============================================================================
DOC_09 = """
<div class='hospital-header'>
  <div class='hospital-title'>LIFELINE GENERAL HOSPITAL & TRAUMA CENTRE</div>
  <div class='hospital-subtitle'>Plot 8, Civil Lines, Kanpur, Uttar Pradesh 208001 | Phone: 0512-2309900</div>
</div>

<div class='doc-badge-danger'>INPATIENT PROGRESS & MEDICATION ORDER (CLINICAL AUDIT TEST RECORD)</div>

<table class='meta-grid'>
  <tr>
    <td class='meta-lbl'>Patient Name:</td><td><strong>Vikram Singh (विक्रम सिंह)</strong></td>
    <td class='meta-lbl'>IPD No / Bed:</td><td>LL-2026-99201 / Bed ICU-04</td>
  </tr>
  <tr>
    <td class='meta-lbl'>Age / Sex:</td><td>61 Yrs / Male</td>
    <td class='meta-lbl'>Date:</td><td><strong>17-03-2026</strong></td>
  </tr>
  <tr>
    <td class='meta-lbl' style='color: #b91c1c;'>ALLERGIES:</td>
    <td colspan='3' style='background-color: #fee2e2; color: #991b1b; font-weight: bold;'>
      KNOWN SEVERE ALLERGY TO PENICILLIN (पेनिसिलिन से गंभीर एलर्जी - Anaphylactic Shock in 2021)
    </td>
  </tr>
</table>

<div class='section-hdr'>DOCTOR'S CLINICAL NOTE & TREATMENT ORDERS (17-03-2026, 21:00 hrs):</div>
<p style='margin: 2px 0;'>Patient admitted with severe chest infection, productive cough, high fever and breathlessness. Patient in respiratory distress.</p>
<div class='vitals-box' style='border-color: #f87171; background-color: #fff1f2;'>
  <strong>Vitals at 21:00:</strong>
  Pulse: <strong>128 bpm (Severe Tachycardia)</strong> &nbsp;|&nbsp;
  BP: <strong>88/54 mmHg (Hypotensive)</strong> &nbsp;|&nbsp;
  Temp: <strong>102.4°F</strong> &nbsp;|&nbsp;
  SpO2: <strong>90% on room air</strong> &nbsp;|&nbsp;
  RR: 28/min
</div>

<div class='section-hdr'>DOCTOR'S ORDERS (TREATMENT SHEET):</div>
<ol style='margin: 2px 0 5px 16px; padding: 0;'>
  <li>Oxygen inhalation via face mask @ 4 L/min to maintain SpO2 > 94%.</li>
  <li style='color: #991b1b;'><strong>Inj. Augmentin (Amoxicillin 1000mg + Clavulanic Acid 200mg) 1.2g IV TDS</strong> stat & continue. <span style='background: #fee2e2;'>[RULE TEST: ALLERGY CONFLICT - PENICILLIN CLASS PRESCRIBED DESPITE DOCUMENTED ALLERGY]</span></li>
  <li><strong>Inj. Hydrocortisone 100mg IV stat</strong> immediately.</li>
  <li><strong>Tab. Paracetamol 500mg</strong> 1 tab SOS for temp > 100°F.</li>
  <li><strong>Inj. Tramadol 50mg IV stat</strong> for severe retrosternal pleuritic chest pain.</li>
  <li>Check vitals every 30 minutes until BP > 100 systolic and HR < 100. Call on-duty doctor if SpO2 < 92%.</li>
</ol>
<p style='margin: 2px 0; text-align: right;'><strong>Doctor Signature:</strong> Dr. K. N. Gupta, MD (Medicine)</p>

<div class='section-hdr'>NURSING ADMINISTRATION RECORD & BED-SIDE FLOW-SHEET:</div>
<table class='table-custom'>
  <tr>
    <th>Time</th>
    <th>Pulse</th>
    <th>BP</th>
    <th>Temp</th>
    <th>SpO2</th>
    <th>Drug Administered & Dose</th>
    <th>Staff Nurse</th>
    <th>Notes / Deviations</th>
  </tr>
  <tr style='background-color: #fff1f2;'>
    <td><strong>17/03 21:00</strong></td>
    <td>128</td>
    <td>88/54</td>
    <td>102.4°F</td>
    <td>90%</td>
    <td>O2 started @ 4L. <strong>Inj. Augmentin 1.2g IV</strong> given</td>
    <td>Nurse Meera</td>
    <td>Penicillin antibiotic given despite allergy banner!</td>
  </tr>
  <tr style='background-color: #fff1f2;'>
    <td><strong>17/03 21:30</strong></td>
    <td>130</td>
    <td>86/50</td>
    <td>102.0°F</td>
    <td>91%</td>
    <td><strong>Inj. Tramadol 100mg IV</strong> given</td>
    <td>Nurse Meera</td>
    <td>[DOSE MISMATCH: Doctor ordered 50mg, nurse gave 100mg!]</td>
  </tr>
  <tr>
    <td>17/03 21:45</td>
    <td>--</td>
    <td>--</td>
    <td>--</td>
    <td>--</td>
    <td><em>Inj. Hydrocortisone 100mg</em></td>
    <td>--</td>
    <td>[ORDER WITHOUT ADMIN: Ordered stat, never signed/given!]</td>
  </tr>
  <tr>
    <td>17/03 22:00</td>
    <td>--</td>
    <td>--</td>
    <td>--</td>
    <td>--</td>
    <td><strong>Tab. Paracetamol 1000mg</strong> given</td>
    <td>Nurse Meera</td>
    <td>[DOSE MISMATCH: Ordered 500mg, administered 1000mg]</td>
  </tr>
  <tr style='background-color: #fef2f2;'>
    <td colspan='8' style='text-align: center; color: #b91c1c; font-weight: bold; padding: 10px;'>
      *** [RULE TEST: CRITICAL MONITORING GAP: 9.5 HOURS OF NO RECORDED VITALS IN AN UNSTABLE TACHYCARDIC & HYPOTENSIVE PATIENT (22:00 to 07:30)] ***
    </td>
  </tr>
  <tr>
    <td><strong>18/03 07:30</strong></td>
    <td>112</td>
    <td>94/60</td>
    <td>100.2°F</td>
    <td>93%</td>
    <td>Shift handover vitals taken</td>
    <td>Nurse Suman</td>
    <td>Morning round. Patient drowsy. Doctor informed.</td>
  </tr>
</table>

<p style='margin: 4px 0; font-size: 8pt; color: #64748b; font-style: italic;'>
Notice: This document is formulated for automated clinical pipeline testing to evaluate detection of: (1) Drug-Allergy contraindications, (2) Dose discrepancy between order and administration, (3) Ordered stat drugs without administration record, and (4) Unmonitored observation gaps during clinical deterioration.
</p>
"""

# ==============================================================================
# EXECUTE DOCUMENT RENDERING
# ==============================================================================
print("Generating Document 1: Emergency Admission Notes...")
doc1 = render_doc("01_doctor_emergency_admission_notes.pdf", DOC_01)

print("Generating Document 2: Surgical Informed Consent Form (Hindi)...")
doc2 = render_doc("02_surgical_informed_consent_hindi.pdf", DOC_02)

print("Generating Document 3: Operation Record (Lap Appendectomy)...")
doc3 = render_doc("03_operation_record_lap_appendectomy.pdf", DOC_03)

print("Generating Document 4: Nursing Vitals & MAR...")
doc4 = render_doc("04_nursing_vitals_chart_and_mar.pdf", DOC_04)

print("Generating Document 5: Lab & Ultrasound Report...")
doc5 = render_doc("05_lab_and_ultrasound_report.pdf", DOC_05)

print("Generating Document 6: Discharge Summary...")
doc6 = render_doc("06_discharge_summary.pdf", DOC_06)

print("Generating Document 7: Outpatient Prescription (Bilingual)...")
doc7 = render_doc("07_opd_prescription_bilingual.pdf", DOC_07)

print("Generating Document 8: Laparoscopic Cholecystectomy Operative Report...")
doc8 = render_doc("08_operation_record_lap_cholecystectomy.pdf", DOC_08)

print("Generating Document 9: Care Deviation & Gap Audit Record...")
doc9 = render_doc("09_care_deviation_and_gap_record.pdf", DOC_09)

# ==============================================================================
# 10. MULTI-PAGE SURGICAL CASE COMPLETE BUNDLE
# ==============================================================================
print("Bundling complete 6-page surgical case (Docs 01 to 06)...")
bundle_doc = fitz.open()
for doc in [doc1, doc2, doc3, doc4, doc5, doc6]:
    bundle_doc.insert_pdf(doc)

bundle_path = os.path.join(OUTPUT_DIR, "complete_surgical_case_bundle.pdf")
bundle_doc.save(bundle_path)
print(f"Generated complete_surgical_case_bundle.pdf ({len(bundle_doc)} pages)")

# Export images of each page of the bundle
for i, page in enumerate(bundle_doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(os.path.join(OUTPUT_DIR, f"complete_surgical_case_bundle_p{i+1}.png"))

print("\nAll medical records generated successfully in:", OUTPUT_DIR)
