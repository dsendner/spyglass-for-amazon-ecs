import AWS from 'aws-sdk/dist/aws-sdk-react-native';
import moment from 'moment';

const config = new AWS.Config();
const regions = [
    {
        label: 'US East (Ohio)',
        value: 'us-east-2'
    },
    {
        label: 'US East (N. Virginia)',
        value: 'us-east-1'
    },
    {
        label: 'US West (Oregon)',
        value: 'us-west-2'
    },
    {
        label: 'US West (N. California)',
        value: 'us-west-1'
    },
    {
        label: 'Canada (Central)',
        value: 'ca-central-1'
    },
    {
        label: 'EU (Frankfurt)',
        value: 'eu-central-1'
    },
    {
        label: 'EU (London)',
        value: 'eu-west-2'
    },
    {
        label: 'EU (Ireland)',
        value: 'eu-west-1'
    },
    {
        label: 'Asia Pacific (Seoul)',
        value: 'ap-northeast-2'
    },
    {
        label: 'Asia Pacific (Tokyo)',
        value: 'ap-northeast-1'
    },
    {
        label: 'Asia Pacific (Sydney)',
        value: 'ap-southeast-2'
    },
    {
        label: 'Asia Pacific (Singapore)',
        value: 'ap-southeast-1'
    }
];

function updateCredentials(accessKey, secretKey, region) {
    config.update({accessKeyId: accessKey, secretAccessKey: secretKey, region});
}

async function getServices(cluster, serviceArns) {
    const ecs = new AWS.ECS(config);
    const {services} = await ecs.describeServices({cluster, services: serviceArns}).promise();

    return services.map(({serviceName, status, serviceArn, events, taskDefinition}) => {
        return {
            key: serviceArn,
            name: serviceName,
            displayName: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
            status,
            events,
            taskDefinitionArn: taskDefinition,
            cluster
        };
    });
}

async function getClusterServices(cluster) {
    const ecs = new AWS.ECS(config);
    const params = {cluster};
    let allServices = [];
    let token;

    do {
        if(token) {
            params.nextToken = token;
        }

        const {serviceArns, nextToken} = await ecs.listServices(params).promise();
        token = nextToken;

        if(serviceArns.length > 0) {
            const services = await getServices(cluster, serviceArns);

            allServices = allServices.concat(services);
        }

    } while(token);

    return allServices;
}

async function getAllServices() {
    const ecs = new AWS.ECS(config);
    const {clusterArns} = await ecs.listClusters().promise();
    const services = await Promise.all(clusterArns.map(c => getClusterServices(c)));

    return [].concat.apply([], services);
}

async function clearCredentials() {
    config.update({accessKeyId: null, secretAccessKey: null, region: null});
}

async function getECSServicesAlarms(token) {
    const cloudwatch = new AWS.CloudWatch(config);
    const {MetricAlarms: alarms, NextToken: nextToken} = await cloudwatch.describeAlarms({NextToken: token}).promise();
    const ecsAlarms = alarms
          .filter(alarm => alarm.Namespace === 'AWS/ECS' && alarm.Dimensions.find(d => d.Name === 'ServiceName'))
          .map(alarm => {
              return {
                  metric: alarm.MetricName,
                  state: alarm.StateValue,
                  operator: alarm.ComparisonOperator,
                  threshold: alarm.Threshold,
                  service: alarm.Dimensions.find(d => d.Name === 'ServiceName').Value
              };
          });

    if (nextToken) {
        return getECSServicesAlarms(nextToken)
            .then(nextAlarms => {
                return ecsAlarms.concat(nextAlarms);
            });
    }

    return ecsAlarms;
}

async function getECSServiceTaskDefinition(taskDefinitionArn) {
    const ecs = new AWS.ECS(config);

    return await ecs.describeTaskDefinition({taskDefinition: taskDefinitionArn}).promise();
}

const byTimestampDesc = (event1, event2) => {
    if(event1.timestamp > event2.timestamp) return -1;
    if(event1.timestamp < event2.timestamp) return 1;

    return 0;
};

async function getCloudwatchLogs(group, streamPrefix) {
    const cloudWatchLogs = new AWS.CloudWatchLogs(config);
    const filterParams = {
        logGroupName: group,
        interleaved: true,
        limit: 100
    };

    if(streamPrefix) {
        const { logStreams } = await cloudWatchLogs.describeLogStreams({
            logGroupName: group,
            logStreamNamePrefix: streamPrefix
        }).promise();

        filterParams.logStreamNames = logStreams.map(l => l.logStreamName);
    }

    const currentTime = moment().valueOf();
    let logs;
    let time = 30;

    while((!logs || logs.events.length === 0) && time <= 300) {
        filterParams.startTime = moment(currentTime).subtract(30, 'seconds').valueOf();
        filterParams.endTime = currentTime;
        logs = await cloudWatchLogs.filterLogEvents(filterParams).promise();
        logs.startTime = filterParams.startTime;
        logs.endTime = filterParams.endTime;
        time = time + 30;
    }

    logs.events = logs.events.sort(byTimestampDesc);

    return logs;
}

let servicesWithAlarmsCache;

async function getECSServicesWithAlarms() {
    const services = await getAllServices();
    const alarms = await getECSServicesAlarms();

    return services.map(s => {
        s.alarms = alarms.filter(a => a.service === s.name);

        return s;
    });
}

async function getCloudwatchLogsForContainer({ logConfiguration, name}) {
    if(logConfiguration.logDriver !== 'awslogs') {
        return {
            name,
            logs: null
        };
    }

    const logsGroup = logConfiguration.options['awslogs-group'];
    const logsStreamPrefix = logConfiguration.options['awslogs-stream-prefix'];
    const logs = await getCloudwatchLogs(logsGroup, logsStreamPrefix);

    return {
        name,
        logs
    };
}

async function getCloudwatchLogsForECSService(taskDefinitionArn){
    const { taskDefinition: {containerDefinitions} } = await getECSServiceTaskDefinition(taskDefinitionArn);

    return Promise.all(containerDefinitions.map(getCloudwatchLogsForContainer));
}

module.exports = {
    regions,
    updateCredentials,
    clearCredentials,
    getServices,
    getECSServicesWithAlarms,
    getCloudwatchLogsForECSService
};
