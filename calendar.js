(() => {
  const monthGrid = document.getElementById('month-grid');
  const monthTitle = document.getElementById('month-title');
  const previousButton = document.getElementById('previous-month');
  const nextButton = document.getElementById('next-month');
  const calendarPlatform = document.getElementById('calendar-platform');
  const platformHelp = document.getElementById('calendar-platform-help');
  const copyStatus = document.getElementById('calendar-copy-status');

  const parseDate = (value) => new Date(`${value}T00:00:00Z`);
  const dateKey = (date) => date.toISOString().slice(0, 10);
  const addDays = (date, count) => new Date(date.getTime() + count * 86400000);
  const sameMonth = (left, right) => left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCFullYear() === right.getUTCFullYear();
  const monthKey = (date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
  const firstOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

  let eventMap;
  let visibleMonth;
  let firstMonth;
  let lastMonth;
  let feedUrl;
  let subscribeUrl;

  function addEvent(eventsByDate, date, event, continuation = false) {
    const key = dateKey(date);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key).push({ ...event, continuation });
  }

  function buildCalendarData(data) {
    const eventsByDate = new Map();
    const noMeetingDates = new Set(data.meetingSchedule.noMeetingDates);
    const overrides = new Map(data.meetingSchedule.overrides.map((event) => [event.date, event]));
    const start = parseDate(data.meetingSchedule.startDate);
    const end = parseDate(data.meetingSchedule.endDate);

    for (let date = start; date <= end; date = addDays(date, 1)) {
      const key = dateKey(date);
      if (date.getUTCDay() !== data.meetingSchedule.weekday) continue;
      if (noMeetingDates.has(key)) continue;

      const override = overrides.get(key);
      addEvent(eventsByDate, date, {
        title: override?.title || 'Tuesday Cubs meeting',
        shortTitle: override?.shortTitle || 'Cubs meet',
        description: override?.description || '',
        location: override?.location || '',
        kind: override?.kind || 'meeting',
        status: override?.status || 'CONFIRMED',
        timeLabel: data.meetingSchedule.timeLabel,
      });
    }

    for (const dateString of noMeetingDates) {
      addEvent(eventsByDate, parseDate(dateString), {
        title: 'No Cubs meeting',
        shortTitle: 'No meeting',
        kind: 'no-meeting',
      });
    }

    for (const event of data.events) {
      const eventStart = parseDate(event.startDate);
      const eventEnd = parseDate(event.endDate || event.startDate);
      for (let date = eventStart; date <= eventEnd; date = addDays(date, 1)) {
        addEvent(eventsByDate, date, event, dateKey(date) !== event.startDate);
      }
    }

    for (const events of eventsByDate.values()) {
      events.sort((a, b) => {
        const order = { 'no-meeting': 0, meeting: 1, 'meeting-special': 2, review: 3, outing: 4, sixer: 5 };
        return (order[a.kind] ?? 6) - (order[b.kind] ?? 6);
      });
    }

    return eventsByDate;
  }

  function eventDetails(event) {
    return [event.timeLabel, event.location, event.description].filter(Boolean).join(' · ');
  }

  function makeEventLabel(event) {
    const label = document.createElement('span');
    label.className = `calendar-event event-${event.kind}`;
    label.title = [event.title, eventDetails(event)].filter(Boolean).join(' — ');
    label.setAttribute('aria-label', label.title);

    const name = document.createElement('span');
    name.className = 'calendar-event-name';
    name.textContent = event.continuation ? '↳ continues' : (event.shortTitle || event.title);
    label.append(name);

    if (event.timeLabel && !event.continuation) {
      const time = document.createElement('small');
      time.textContent = event.timeLabel;
      label.append(time);
    }
    return label;
  }

  function makeMonthTable(monthStart) {
    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth();
    const monthName = new Intl.DateTimeFormat('en-IE', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(monthStart);
    const table = document.createElement('table');
    table.className = 'calendar-month-table';
    table.setAttribute('aria-label', monthName);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = weekday;
      headerRow.append(cell);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
    const firstVisibleDate = addDays(monthStart, -firstWeekday);

    for (let week = 0; week < weekCount; week += 1) {
      const row = document.createElement('tr');
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const date = addDays(firstVisibleDate, week * 7 + weekday);
        const key = dateKey(date);
        const cell = document.createElement('td');
        cell.className = 'month-day';
        if (!sameMonth(date, monthStart)) cell.classList.add('outside-month');
        if (weekday >= 5) cell.classList.add('weekend-day');

        const events = sameMonth(date, monthStart) ? (eventMap.get(key) || []) : [];
        const weekdayName = new Intl.DateTimeFormat('en-IE', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
        }).format(date);
        const eventNames = events.map((event) => event.title).join('; ');
        cell.setAttribute('aria-label', eventNames ? `${weekdayName}; ${eventNames}` : weekdayName);

        const number = document.createElement('time');
        number.dateTime = key;
        number.className = 'month-day-number';
        number.textContent = date.getUTCDate();
        cell.append(number);

        const dayEvents = document.createElement('div');
        dayEvents.className = 'day-events';
        for (const event of events) dayEvents.append(makeEventLabel(event));
        cell.append(dayEvents);
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(tbody);
    return table;
  }

  function renderMonth() {
    const monthStart = firstOfMonth(visibleMonth);
    monthTitle.textContent = new Intl.DateTimeFormat('en-IE', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(monthStart);
    monthGrid.replaceChildren(makeMonthTable(monthStart));
    previousButton.disabled = monthKey(monthStart) <= monthKey(firstMonth);
    nextButton.disabled = monthKey(monthStart) >= monthKey(lastMonth);
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('Clipboard access is unavailable.'));
  }

  function detectPlatform() {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    if (/iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1)) return 'iphone';
    if (/Android/i.test(userAgent)) return 'android';
    if (/Mac/i.test(platform)) return 'mac';
    if (/Win/i.test(platform)) return 'windows';
    if (/Linux/i.test(platform)) return 'linux';
    return 'other';
  }

  function addCopyFeedButton(container, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-feed-button';
    button.dataset.copyCalendarUrl = 'true';
    button.textContent = label;
    container.append(button);
  }

  function addHelpLink(container, label, url) {
    const link = document.createElement('a');
    link.className = 'calendar-help-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${label} ↗`;
    container.append(link);
  }

  function addSubscribeLink(container, label) {
    const link = document.createElement('a');
    link.className = 'calendar-primary-action';
    link.href = subscribeUrl.href;
    link.textContent = label;
    container.append(link);
  }

  function addInstructions(container, title, text, copyLabel, help) {
    const details = document.createElement('details');
    details.className = 'calendar-platform-details';
    const summary = document.createElement('summary');
    summary.textContent = title;
    const content = document.createElement('div');
    content.className = 'calendar-platform-detail-content';
    const explanation = document.createElement('p');
    explanation.textContent = text;
    content.append(explanation);
    addCopyFeedButton(content, copyLabel);
    if (help) addHelpLink(content, help.label, help.url);
    details.append(summary, content);
    container.append(details);
  }

  function renderPlatformHelp(selectedPlatform) {
    const platform = selectedPlatform === 'auto' ? detectPlatform() : selectedPlatform;
    platformHelp.replaceChildren();
    copyStatus.textContent = '';

    const heading = document.createElement('strong');
    const explanation = document.createElement('p');
    const primary = document.createElement('div');
    primary.className = 'calendar-primary-actions';
    const section = document.createElement('div');
    section.className = 'calendar-platform-card';
    section.append(heading, explanation, primary);

    if (platform === 'iphone') {
      heading.textContent = 'Apple Calendar on iPhone or iPad';
      explanation.textContent = 'Tap below to subscribe. The calendar will stay up to date when dates change.';
      addSubscribeLink(primary, 'Subscribe in Apple Calendar');
      addInstructions(section, 'If tapping Subscribe does not open Calendar', 'In Calendar, tap Add Calendar → Add Subscription Calendar, then enter the calendar address.', 'Copy Apple Calendar address', {
        label: 'Apple setup steps', url: 'https://support.apple.com/en-ie/102301',
      });
    } else if (platform === 'mac') {
      heading.textContent = 'Apple Calendar on Mac';
      explanation.textContent = 'Tap below to open a calendar subscription in Calendar; confirm Subscribe when prompted.';
      addSubscribeLink(primary, 'Subscribe in Apple Calendar');
      addInstructions(section, 'If tapping Subscribe does not open Calendar', 'In Calendar, choose File → New Calendar Subscription and paste the calendar address.', 'Copy Apple Calendar address', {
        label: 'Apple setup steps', url: 'https://support.apple.com/en-ng/guide/calendar/icl1022/mac',
      });
    } else if (platform === 'android') {
      heading.textContent = 'Google Calendar on Android';
      explanation.textContent = 'Google Calendar’s Android app cannot subscribe to a calendar from a web address. Add it once in Google Calendar on a computer; it will then sync to your phone.';
      addCopyFeedButton(primary, 'Copy link for Google Calendar setup');
      addHelpLink(primary, 'Google’s setup steps', 'https://support.google.com/calendar/answer/37100?hl=en');
      addInstructions(section, 'Using a different Android calendar app?', 'If your calendar app supports internet calendars, use its Add calendar or Subscribe by URL option.', 'Copy calendar subscription address');
      const otherAndroidApp = document.createElement('div');
      otherAndroidApp.className = 'calendar-primary-actions calendar-secondary-action';
      addSubscribeLink(otherAndroidApp, 'Try another Android calendar app');
      section.append(otherAndroidApp);
    } else if (platform === 'google') {
      heading.textContent = 'Google Calendar';
      explanation.textContent = 'On a computer, open Google Calendar and choose Other calendars + → From URL. Paste the address below to subscribe and receive updates.';
      addCopyFeedButton(primary, 'Copy Google Calendar subscription link');
      addHelpLink(primary, 'Open Google Calendar', 'https://calendar.google.com/calendar/');
      addHelpLink(section, 'Google’s setup steps', 'https://support.google.com/calendar/answer/37100?hl=en');
    } else if (platform === 'windows' || platform === 'outlook') {
      heading.textContent = platform === 'windows' ? 'Windows calendar apps' : 'Outlook';
      explanation.textContent = 'Tap below to open the subscription in a calendar app that handles calendar links. For Outlook on the web, use Subscribe from web to keep it updated.';
      addSubscribeLink(primary, 'Subscribe in Outlook or another app');
      addInstructions(section, 'Using Outlook on the web?', 'Open Outlook Calendar → Add calendar → Subscribe from web, then paste the calendar address.', 'Copy Outlook subscription address', {
        label: 'Microsoft setup steps', url: 'https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c',
      });
    } else if (platform === 'linux') {
      heading.textContent = 'Linux calendar apps';
      explanation.textContent = 'Tap below to open this subscription in a calendar app that handles calendar links. Most desktop apps also let you subscribe by URL.';
      addSubscribeLink(primary, 'Subscribe in a calendar app');
      addInstructions(section, 'Adding it in Evolution or another app', 'In Evolution, choose File → New → Calendar → On the Web, then paste the calendar address.', 'Copy calendar subscription address', {
        label: 'Evolution setup steps', url: 'https://help.gnome.org/evolution/calendar-webdav.html',
      });
    } else {
      heading.textContent = 'Add to a calendar app';
      explanation.textContent = 'Subscribe for automatic updates in a compatible calendar app, or download a one-time copy below.';
      addSubscribeLink(primary, 'Subscribe in a calendar app');
      addInstructions(section, 'If your calendar app asks for an address', 'Choose Subscribe by URL or Add internet calendar, then paste the calendar address.', 'Copy calendar subscription address');
    }

    platformHelp.append(section);
  }

  previousButton.addEventListener('click', () => {
    if (monthKey(visibleMonth) > monthKey(firstMonth)) {
      visibleMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() - 1, 1));
      renderMonth();
    }
  });

  nextButton.addEventListener('click', () => {
    if (monthKey(visibleMonth) < monthKey(lastMonth)) {
      visibleMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1));
      renderMonth();
    }
  });

  calendarPlatform.addEventListener('change', () => renderPlatformHelp(calendarPlatform.value));

  platformHelp.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-copy-calendar-url]')) return;
    try {
      await copyText(feedUrl.href);
      copyStatus.textContent = 'Calendar address copied. Return to the setup steps and paste it into your calendar app.';
    } catch {
      copyStatus.textContent = `Copy this calendar address: ${feedUrl.href}`;
    }
  });

  fetch('assets/calendar.json')
    .then((response) => {
      if (!response.ok) throw new Error('Calendar data could not be loaded.');
      return response.json();
    })
    .then((data) => {
      eventMap = buildCalendarData(data);
      firstMonth = parseDate(`${data.startMonth}-01`);
      lastMonth = parseDate(`${data.endMonth}-01`);
      const today = new Date();
      const thisMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
      visibleMonth = monthKey(thisMonth) < monthKey(firstMonth) ? firstMonth
        : monthKey(thisMonth) > monthKey(lastMonth) ? lastMonth : thisMonth;

      feedUrl = new URL('assets/ennis-tuesday-cubs.ics', document.baseURI);
      subscribeUrl = new URL(feedUrl.href);
      subscribeUrl.protocol = 'webcal:';
      const platformNames = {
        iphone: 'iPhone or iPad', android: 'Android', mac: 'Mac', windows: 'Windows',
        linux: 'Linux', other: 'this device',
      };
      calendarPlatform.options[0].textContent = `This device (${platformNames[detectPlatform()]})`;
      calendarPlatform.disabled = false;
      renderPlatformHelp(calendarPlatform.value);

      renderMonth();
    })
    .catch(() => {
      monthTitle.textContent = 'Calendar unavailable';
      previousButton.disabled = true;
      nextButton.disabled = true;
      monthGrid.replaceChildren();
      const message = document.createElement('p');
      message.className = 'calendar-loading calendar-error';
      message.setAttribute('role', 'alert');
      message.textContent = 'The calendar could not be loaded. Please refresh the page or open the calendar PDF.';
      monthGrid.append(message);
    });
})();
